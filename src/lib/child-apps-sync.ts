// Q15（docs/decisions.md D-110）: 子どもの端末のホーム画面に出るアプリの一覧とアイコンを、親16 の候補・保護者の画面のアイコンとして
// サーバへ送る。
// 決まり:
//   - 確かめる（Kotlin から一覧を取る）のは、起動して最初の回と、そのあと1日1回（CHECK_INTERVAL_MS）だけ。
//     child-data.tsx の refresh（30 秒ごと）から毎回呼ばれるが、時刻が来ていなければ何もしない（毎回の取得で送らない）
//   - 前に送った中身と同じなら送らない。サーバの DB が作り直された（C7 の epoch が変わった。D-109）ときは、同じ中身でも送り直す
//     （なぜ: 作り直した DB には一覧がないので、送らないと親16 が「まだ届いていません」のままになる）
//   - アイコンは重いので一覧には入れず（中身のハッシュだけ入れる）、サーバが「持っていない」と返したアイコン（iconsNeeded）だけを
//     MAX_APP_ICONS_PER_CALL 枚ずつ送る。アイコンを送り切れなかったら「送った」と覚えない（次の回に一覧から送り直し、
//     サーバがまだ足りないアイコンを返す）
//   - 送れなかったら RETRY_INTERVAL_MS あとにもう一度確かめる。Kotlin がない・一覧が取れないときは送らない（空の一覧を送らない）
//   - 失敗しても例外は外へ出さない（画面の更新・C8 の送信を止めない）
// 中心の判断（normalizeChildApps・createChildAppsSync）は通信と保存を外から渡す（tests/lib/child-apps-sync.test.ts で差し替える）。
// Kotlin から一覧を取る関数は run に渡す（child-data.tsx が native.getLauncherApps を渡す）。
//   なぜ: ここで native.ts を読み込むと、ログアウトの処理（sign-out.ts → clear）からも expo の部品を読むことになり、
//   Node のテストで読み込めなくなるため
import type { NativeLauncherApp, NativeLauncherAppsResult } from "@contracts/native";
import {
  AppIconHash,
  AppIconPng,
  type ChildApp,
  type ChildAppIcon,
  MAX_APP_ICONS_PER_CALL,
  MAX_CHILD_APPS,
  PackageName,
} from "@contracts/schemas";
import { z } from "zod";
import { call } from "./api";
import { configCache } from "./config-cache";
import { appStorage, type KeyValueStorage, readJson, storageKeys, writeJson } from "./storage";

export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1日1回
export const RETRY_INTERVAL_MS = 30 * 60 * 1000; // 送れなかったら 30 分あとに

// 契約（contracts/schemas.ts の ChildApp）の名前の長さの上限（packageName の形と長さは、契約の PackageName をそのまま使って確かめる）
const MAX_LABEL = 120;

// 文字の数（UTF-16 の単位。Zod の max と同じ数え方）で切る。絵文字などの途中では切らない
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const code = s.charCodeAt(max - 1);
  const end = code >= 0xd800 && code <= 0xdbff ? max - 1 : max;
  return s.slice(0, end);
}

// Kotlin のアイコンが契約に合うか（ハッシュの形・base64・大きさ）。合わなければアイコンなしとして扱う（一覧は送る）
function iconOf(app: NativeLauncherApp): { iconHash: string; png: string } | null {
  if (!app.iconHash || !app.iconPng) return null;
  if (!AppIconHash.safeParse(app.iconHash).success || !AppIconPng.safeParse(app.iconPng).success) return null;
  return { iconHash: app.iconHash, png: app.iconPng };
}

// Kotlin の一覧 → 送る一覧（契約に合う形）とアイコン。Kotlin も整えているが、古い版の Kotlin・ほかの OS でも契約で断られないように
// ここでも整える:
//   packageName は前後の空白を除き、契約の PackageName（英数字・"_" を "." でつなぐ形・255 文字まで）に合わないものは1件ずつ外す
//   （1件でも合わないと、一覧の送信（childAppsUpload）が毎回 400 になるため）／名前は前後の空白を除き、空なら packageName、長すぎれば切る／
//   同じアプリは1つ（先に出た方）／packageName の順／多すぎれば MAX_CHILD_APPS 件まで／契約に合わないアイコンは付けない
export function prepareChildApps(apps: readonly NativeLauncherApp[]): { apps: ChildApp[]; icons: ChildAppIcon[] } {
  const byPackage = new Map<string, { app: ChildApp; png: string | null }>();
  for (const raw of apps) {
    const packageName = raw.packageName.trim();
    if (!PackageName.safeParse(packageName).success || byPackage.has(packageName)) continue;
    const label = clip(raw.label.trim() || packageName, MAX_LABEL);
    const icon = iconOf(raw);
    byPackage.set(packageName, {
      app: icon ? { packageName, label, iconHash: icon.iconHash } : { packageName, label },
      png: icon?.png ?? null,
    });
  }
  const kept = [...byPackage.values()]
    .sort((a, b) => (a.app.packageName < b.app.packageName ? -1 : a.app.packageName > b.app.packageName ? 1 : 0))
    .slice(0, MAX_CHILD_APPS);
  return {
    apps: kept.map((k) => k.app),
    icons: kept.flatMap((k) =>
      k.png && k.app.iconHash ? [{ packageName: k.app.packageName, iconHash: k.app.iconHash, png: k.png }] : [],
    ),
  };
}

// 送る一覧だけ（アイコンの画像を除いたもの）
export function normalizeChildApps(apps: readonly NativeLauncherApp[]): ChildApp[] {
  return prepareChildApps(apps).apps;
}

// 端末に覚えておく「前に送った中身」（slope.child-apps.<childId>）。ログアウトで消す（sign-out.ts）
const Sent = z.object({
  key: z.string(), // 送った一覧（normalizeChildApps の結果の JSON。アイコンのハッシュを含む）
  epoch: z.string().nullable(), // 送ったときの C7 の epoch（分からなければ null）
  sentAt: z.string(),
});

// 1回の結果（テストと記録用。画面は使わない）
//   skipped: 時刻がまだ・ほかの回が動いている / unavailable: 一覧が取れない / unchanged: 前と同じ / sent: 送った / failed: 送れなかった
export type ChildAppsSyncResult = "skipped" | "unavailable" | "unchanged" | "sent" | "failed";

export type ChildAppsSyncDeps = {
  storage: KeyValueStorage;
  upload: (childId: string, apps: ChildApp[]) => Promise<{ iconsNeeded: readonly string[] }>;
  uploadIcons: (childId: string, icons: ChildAppIcon[]) => Promise<unknown>;
  epoch: (childId: string) => Promise<string | null>; // 今の C7 の epoch（端末に保存してある組の値）
  now?: () => number;
};

export function createChildAppsSync(deps: ChildAppsSyncDeps) {
  const now = deps.now ?? (() => Date.now());
  // 次に確かめる時刻（メモリの上だけ。アプリを起動し直すと空になる = 起動して最初の回は必ず確かめる）
  const nextCheckAt = new Map<string, number>();
  const running = new Set<string>();

  async function check(
    childId: string,
    getApps: () => Promise<NativeLauncherAppsResult>,
  ): Promise<{ result: ChildAppsSyncResult; retryMs: number }> {
    const got = await getApps().catch(
      (): NativeLauncherAppsResult => ({ status: "unavailable", reason: "アプリの一覧を取得できませんでした" }),
    );
    if (got.status !== "ok") return { result: "unavailable", retryMs: CHECK_INTERVAL_MS };
    const { apps, icons } = prepareChildApps(got.apps);
    const key = JSON.stringify(apps);
    const epoch = await deps.epoch(childId).catch(() => null);
    const sent = await readJson(deps.storage, storageKeys.childApps(childId), Sent);
    // epoch が分からないとき（設定をまだ一度も取れていない）は、中身だけで比べる
    if (sent && sent.key === key && (epoch == null || sent.epoch === epoch))
      return { result: "unchanged", retryMs: CHECK_INTERVAL_MS };
    try {
      const { iconsNeeded } = await deps.upload(childId, apps);
      const needed = new Set(iconsNeeded);
      const toSend = icons.filter((i) => needed.has(i.packageName));
      for (let i = 0; i < toSend.length; i += MAX_APP_ICONS_PER_CALL)
        await deps.uploadIcons(childId, toSend.slice(i, i + MAX_APP_ICONS_PER_CALL));
    } catch {
      return { result: "failed", retryMs: RETRY_INTERVAL_MS };
    }
    // 覚えられなくても送れてはいる（次に確かめたときに、もう一度送るだけ）
    await writeJson(deps.storage, storageKeys.childApps(childId), {
      key,
      epoch,
      sentAt: new Date(now()).toISOString(),
    }).catch(() => undefined);
    return { result: "sent", retryMs: CHECK_INTERVAL_MS };
  }

  return {
    // 時刻が来ていれば確かめて（getApps で一覧を取り）、変わっていれば送る。例外は投げない
    async run(childId: string, getApps: () => Promise<NativeLauncherAppsResult>): Promise<ChildAppsSyncResult> {
      const due = nextCheckAt.get(childId);
      if (running.has(childId) || (due != null && now() < due)) return "skipped";
      running.add(childId);
      try {
        const { result, retryMs } = await check(childId, getApps).catch(() => ({
          result: "failed" as const,
          retryMs: RETRY_INTERVAL_MS,
        }));
        nextCheckAt.set(childId, now() + retryMs);
        return result;
      } finally {
        running.delete(childId);
      }
    },

    // 覚えた中身を消す（ログアウトのとき）。同じ人が入り直したら、起動して最初の回のように確かめ直す
    async clear(childId: string): Promise<void> {
      nextCheckAt.delete(childId);
      await deps.storage.removeItem(storageKeys.childApps(childId));
    },
  };
}

export type ChildAppsSync = ReturnType<typeof createChildAppsSync>;

// アプリで使う1つ（サーバの childAppsUpload・端末の AsyncStorage につながっている。Kotlin の一覧は run に渡す）
export const childAppsSync: ChildAppsSync = createChildAppsSync({
  storage: appStorage,
  upload: (childId, apps) => call("childAppsUpload", { childId, apps }),
  uploadIcons: (childId, icons) => call("childAppIconsUpload", { childId, icons }),
  epoch: (childId) => configCache.epoch(childId),
});
