// Q15（docs/decisions.md D-110）: 保護者の画面（親09・親16）に出す、子どもの端末のアプリの本物のアイコン。
// 決まり:
//   - どのアプリのアイコンが今どれか（ハッシュ）は childAppsGet の一覧で分かる。この一覧は HASH_LIST_TTL_MS のあいだ覚えて使い回す
//     （親16 は自分で読んだ一覧を rememberList で渡すので、読み直さない）
//   - アイコンの画像は、この端末にまだない・ハッシュが変わったものだけを MAX_APP_ICONS_PER_CALL 個ずつ childAppIconsGet で読む
//     （一覧を取り直すたびに全部を読み直さない）。読んだ画像はアプリが動いている間メモリに置く（ログアウトで消す）。
//     なぜメモリだけか: AsyncStorage は Android で全体 6MB ほどまでなので、数百枚の画像を置くと設定などの保存を押し出してしまうため
//   - アイコンがない・まだ届いていない・読めないアプリは何も返さない（画面は仮のアイコン＝頭文字のまま。空白にしない）
//   - 失敗しても例外は外へ出さない（画面の表示を止めない）
// 中心（createAppIconCache）は通信を外から渡す（tests/lib/app-icons.test.ts で差し替える）。
import type { ChildAppEntry, ChildAppIcon, ChildAppsView } from "@contracts/schemas";
import { MAX_APP_ICONS_PER_CALL } from "@contracts/schemas";
import { useEffect, useState } from "react";
import { call } from "./api";

export const HASH_LIST_TTL_MS = 10 * 60 * 1000; // 一覧（ハッシュ）を使い回す時間

export type AppIconDeps = {
  fetchList: (childId: string) => Promise<Pick<ChildAppsView, "apps">>;
  fetchIcons: (childId: string, packageNames: string[]) => Promise<ChildAppIcon[]>;
  now?: () => number;
};

type Cached = { iconHash: string; uri: string };

export const iconUri = (png: string) => `data:image/png;base64,${png}`;

export function createAppIconCache(deps: AppIconDeps) {
  const now = deps.now ?? (() => Date.now());
  const icons = new Map<string, Map<string, Cached>>(); // childId → packageName → 画像
  const lists = new Map<string, { at: number; hashes: Map<string, string | null> }>(); // childId → packageName → ハッシュ
  const listLoading = new Map<string, Promise<Map<string, string | null>>>();

  const iconsOf = (childId: string) => {
    let m = icons.get(childId);
    if (!m) {
      m = new Map();
      icons.set(childId, m);
    }
    return m;
  };

  function rememberList(childId: string, apps: readonly Pick<ChildAppEntry, "packageName" | "iconHash">[]): void {
    lists.set(childId, { at: now(), hashes: new Map(apps.map((a) => [a.packageName, a.iconHash])) });
  }

  // 今のハッシュの一覧（覚えた一覧が新しければそれ。読めなければ前の一覧、なければ空）
  async function hashes(childId: string): Promise<Map<string, string | null>> {
    const cached = lists.get(childId);
    if (cached && now() - cached.at < HASH_LIST_TTL_MS) return cached.hashes;
    const loading = listLoading.get(childId);
    if (loading) return loading;
    const p = deps
      .fetchList(childId)
      .then((view) => {
        rememberList(childId, view.apps);
        return lists.get(childId)?.hashes ?? new Map<string, string | null>();
      })
      .catch(() => cached?.hashes ?? new Map<string, string | null>())
      .finally(() => listLoading.delete(childId));
    listLoading.set(childId, p);
    return p;
  }

  // 端末にある画像だけで答える（通信しない）。ハッシュが分かっていて違うもの（古い画像）は出さない
  function peek(childId: string, packageNames: readonly string[]): Map<string, string> {
    const have = icons.get(childId);
    const known = lists.get(childId)?.hashes;
    const out = new Map<string, string>();
    for (const p of packageNames) {
      const c = have?.get(p);
      if (!c) continue;
      const h = known?.get(p);
      if (h === undefined || h === c.iconHash) out.set(p, c.uri);
    }
    return out;
  }

  // packageNames のアイコン（ある分だけ）。足りない・変わったものだけを読む
  async function load(childId: string, packageNames: readonly string[]): Promise<Map<string, string>> {
    const known = await hashes(childId);
    const have = iconsOf(childId);
    const stale = [...new Set(packageNames)].filter((p) => {
      const h = known.get(p);
      return h != null && have.get(p)?.iconHash !== h;
    });
    for (let i = 0; i < stale.length; i += MAX_APP_ICONS_PER_CALL) {
      try {
        const got = await deps.fetchIcons(childId, stale.slice(i, i + MAX_APP_ICONS_PER_CALL));
        for (const icon of got) have.set(icon.packageName, { iconHash: icon.iconHash, uri: iconUri(icon.png) });
      } catch {
        // 読めなかった分は仮のアイコンのまま（次に画面を開いたときにもう一度読む）
      }
    }
    // 一覧でアイコンがなくなった（null）アプリは出さない。ハッシュの分からないアプリ（一覧にない）は、持っている画像を出す
    const out = new Map<string, string>();
    for (const p of packageNames) {
      const c = have.get(p);
      if (c && known.get(p) !== null) out.set(p, c.uri);
    }
    return out;
  }

  return {
    rememberList,
    peek,
    load,
    // 全部消す（ログアウトのとき。前の人の子どものアイコンを残さない）
    clear(): void {
      icons.clear();
      lists.clear();
      listLoading.clear();
    },
  };
}

export type AppIconCache = ReturnType<typeof createAppIconCache>;

// アプリで使う1つ（サーバの childAppsGet・childAppIconsGet につながっている）
export const appIconCache: AppIconCache = createAppIconCache({
  fetchList: (childId) => call("childAppsGet", { childId }),
  fetchIcons: async (childId, packageNames) => (await call("childAppIconsGet", { childId, packageNames })).icons,
});

// 画面用: packageNames のアイコンの uri（ある分だけ）。最初は端末にある分ですぐ描き、足りない分を読んだら描き直す
export function useAppIcons(childId: string, packageNames: readonly string[]): ReadonlyMap<string, string> {
  const key = packageNames.join("\n");
  const [uris, setUris] = useState<ReadonlyMap<string, string>>(() => appIconCache.peek(childId, packageNames));
  // packageNames の中身は key で比べる（描き直しのたびに新しい配列が来ても読み直さない）
  useEffect(() => {
    let alive = true;
    const names = key ? key.split("\n") : [];
    setUris(appIconCache.peek(childId, names));
    void appIconCache.load(childId, names).then((m) => {
      if (alive) setUris(m);
    });
    return () => {
      alive = false;
    };
  }, [childId, key]);
  return uris;
}
