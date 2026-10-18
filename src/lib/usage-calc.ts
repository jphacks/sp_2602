// C3: 利用時間・利用割合・上限到達の計算（MVP_SPEC 4.2）。画面から切り離した純粋な関数（tests/lib/usage-calc.test.ts）。
// 入力は C2 の実績（端末が測ったアプリ別の分数）・C7 の当日の上限・C9 の対象外アプリ・必須例外。C10 の上限をここで計算し直さない。
// 取れなかった値を 0 分にしない: 実績が取れない・権限がない・上限が未設定・上限が負・制限なし（空白期間。Q7）は、それぞれ別の状態で返す。
//   const r = calcUsage({ usage, limit: limitForDate(snapshot, today), excludedPackages, essentialPackages });
//   if (r.state === "ok") { r.displayUsedPercent … r.reached … }
import { addDays } from "@contracts/dates";
import type { NativeAppUsage, NativeDayLimit, NativeRestriction, NativeUsageResult } from "@contracts/native";
import { type ConfigSnapshot, PackageName, type UsageDayReport } from "@contracts/schemas";

// 安全上の必須例外（電話・緊急通報など）。C9 の対象外アプリとは別に、いつも制限しない（MVP_SPEC 3.1・C4）
// TODO(未決): 必須例外の正式な一覧（C4 の実機検証で決める）。今は電話・緊急・連絡先と、このアプリ自身
export const ESSENTIAL_PACKAGES: readonly string[] = [
  "com.android.phone",
  "com.android.dialer",
  "com.google.android.dialer",
  "com.samsung.android.dialer",
  "com.android.emergency",
  "com.android.contacts",
  "com.samsung.android.app.contacts",
  "com.quedotcom.androidslope", // このアプリ自身（app.json の android.package と同じにする）
];

// 上限に達したとき誘導する学習用アプリ（C4 で Kotlin に渡す一覧と、子11「お勧めアプリはこちらです」で上から順に開く一覧は同じもの）。
// TODO(未決): 正式な一覧（C4 の実機検証で決める）。今は仮に、よく使われる学習用のアプリを並べた
export const LEARNING_PACKAGES: readonly string[] = [
  "com.google.android.apps.classroom", // Google Classroom
  "com.duolingo", // Duolingo
];

// 当日の上限の状態（C7 から作る）
export type LimitInput =
  | { kind: "set"; minutes: number } // 上限がある（0 も有効な上限）
  | { kind: "unlimited" } // 制限なし（空白期間中。0 分とも未設定とも違う。Q7）
  | { kind: "unset" } // 親がまだ通常上限を決めていない・その日の値がない（上限未設定）
  | { kind: "unknown" }; // 設定を取れていない（通信失敗でキャッシュもない）

// C3 の結果
export type UsageCalc =
  | {
      state: "ok";
      usedMinutes: number; // 制限対象アプリの合計（実際の値。100% を超えても丸めない）
      limitMinutes: number;
      actualPercent: number; // 実際の使用率（100 を超えることがある。上限 0 分なら Infinity ではなく 100 として扱う）
      // 画面に出す使用済みの割合（0〜100 の整数）。100 は「到達」のときだけ（到達していなければ最大 99。下の calcUsage の説明）
      displayUsedPercent: number;
      remainingPercent: number; // 画面に出す残りの割合 = max(0, 100 − displayUsedPercent)
      remainingMinutes: number; // max(0, 上限 − 使用)。子どもの画面には主に出さない（MVP_SPEC 4.2）
      reached: boolean; // 上限に達したか
    }
  | { state: "unlimited"; usedMinutes: number } // 制限なし（空白期間中）。割合は出さない・到達しない
  | { state: "permission_denied" } // 使用状況へのアクセスが許可されていない（C2）
  | { state: "usage_unavailable"; reason: string } // 実績が取れない（C2）
  | { state: "limit_unset" } // 上限が未設定
  | { state: "limit_unknown" } // 上限が分からない（設定を取得できない）
  | { state: "limit_invalid" }; // 上限が負（エラー）

export type CalcInput = {
  usage: NativeUsageResult;
  limit: LimitInput;
  excludedPackages: readonly string[]; // C9 の対象外アプリ
  essentialPackages?: readonly string[]; // 必須例外（省くと ESSENTIAL_PACKAGES）
  // TODO(未決): 到達の判定に等号を含むか（FigJam の図の矛盾 10）。既定は「使用 ≥ 上限 で到達」（上限 0 分は必ず到達になる）
  reachedWhen?: "gte" | "gt";
};

// そのアプリを制限の対象から外すか（C9 の対象外 or 必須例外）。C3 と C4 で同じ判定を使う
export function isExcluded(
  packageName: string,
  excludedPackages: readonly string[],
  essentialPackages: readonly string[] = ESSENTIAL_PACKAGES,
): boolean {
  return excludedPackages.includes(packageName) || essentialPackages.includes(packageName);
}

// 制限対象アプリの合計（分）
export function restrictedMinutes(
  apps: readonly NativeAppUsage[],
  excludedPackages: readonly string[],
  essentialPackages: readonly string[] = ESSENTIAL_PACKAGES,
): number {
  return apps
    .filter((a) => !isExcluded(a.packageName, excludedPackages, essentialPackages))
    .reduce((sum, a) => sum + Math.max(0, a.usedMinutes), 0);
}

export function calcUsage(input: CalcInput): UsageCalc {
  const { usage, limit } = input;
  // 実績が取れないことを先に返す（上限があっても 0 分として計算しない）
  if (usage.status === "permission_denied") return { state: "permission_denied" };
  if (usage.status === "unavailable") return { state: "usage_unavailable", reason: usage.reason };
  if (limit.kind === "unset") return { state: "limit_unset" };
  if (limit.kind === "unlimited")
    return {
      state: "unlimited",
      usedMinutes: restrictedMinutes(usage.apps, input.excludedPackages, input.essentialPackages),
    };
  if (limit.kind === "unknown") return { state: "limit_unknown" };
  if (limit.minutes < 0 || !Number.isFinite(limit.minutes)) return { state: "limit_invalid" };

  const used = restrictedMinutes(usage.apps, input.excludedPackages, input.essentialPackages);
  const L = limit.minutes;
  const reachedWhen = input.reachedWhen ?? "gte";
  if (L === 0) {
    // 0 分は有効な上限で、到達扱い。0 で割らない（MVP_SPEC 4.2・C3 の図: 表示 100%・残り 0%）
    return {
      state: "ok",
      usedMinutes: used,
      limitMinutes: 0,
      actualPercent: 100,
      displayUsedPercent: 100,
      remainingPercent: 0,
      remainingMinutes: 0,
      reached: true,
    };
  }
  const actualPercent = (used / L) * 100;
  // 到達は実際の分数で決める（割合を丸めた値では決めない）
  const reached = reachedWhen === "gte" ? used >= L : used > L;
  // 表示と到達をそろえる: 到達していないのに「100%」と出さない（なぜ: 99.5% 以上は四捨五入で 100 になり、
  // 「100% なのにまだ使える」と見えてしまうため）。到達していないときは最大 99、到達したら 100 に収める
  const rounded = Math.round(Math.min(100, Math.max(0, actualPercent)));
  const displayUsedPercent = reached ? 100 : Math.min(99, rounded);
  return {
    state: "ok",
    usedMinutes: used,
    limitMinutes: L,
    actualPercent,
    displayUsedPercent,
    remainingPercent: Math.max(0, 100 - displayUsedPercent),
    remainingMinutes: Math.max(0, L - used),
    reached,
  };
}

// C7 のスナップショットから、ある日の上限を取り出す。スナップショットがない = 分からない、日付がない = 未設定、空白期間 = 制限なし
export function limitForDate(snapshot: ConfigSnapshot | null, date: string): LimitInput {
  if (!snapshot) return { kind: "unknown" };
  const hit = snapshot.dailyLimits.find((l) => l.date === date);
  if (!hit) return { kind: "unset" };
  return hit.kind === "unlimited" ? { kind: "unlimited" } : { kind: "set", minutes: hit.limitMinutes };
}

// Kotlin に先の日の上限を何日分渡すか（電波がなく Slope を開かない日が続いても、この日数は端末だけで判定できる）
export const RESTRICTION_UPCOMING_DAYS = 14;

// C4: C7 のスナップショットから、Kotlin に渡す判定の値（NativeRestriction）を作る（child-data.tsx の refresh が saveRestriction に渡す）。
// 上限の区別は data.md 2章のとおり: 上限あり（0 分を含む）= limited、空白期間 = unlimited、日付がない = unset。
// upcoming は date の翌日から RESTRICTION_UPCOMING_DAYS 日分（Kotlin は日付が変わったら、ここから今日の上限を取り出す）。
// testPeriods は判定には使わず、Kotlin がウィジェット（C5）の「次のテスト」のために保存する。
// blockedSites（D-111）は Kotlin の engine/WebGuardService.kt が読む（上限に達した日だけ、ブラウザで開いたら止める）
export function toNativeRestriction(
  snapshot: ConfigSnapshot,
  date: string,
  opts: { essentialPackages?: readonly string[]; learningPackages?: readonly string[] } = {},
): NativeRestriction {
  const toNative = (d: string): NativeDayLimit => {
    const l = limitForDate(snapshot, d);
    if (l.kind === "set") return { kind: "limited", limitMinutes: l.minutes };
    if (l.kind === "unlimited") return { kind: "unlimited" };
    return { kind: "unset" }; // スナップショットがあるので unknown にはならない
  };
  return {
    date,
    limit: toNative(date),
    upcoming: Array.from({ length: RESTRICTION_UPCOMING_DAYS }, (_, i) => {
      const d = addDays(date, i + 1);
      return { date: d, limit: toNative(d) };
    }),
    excludedPackages: snapshot.excludedApps.map((a) => a.packageName),
    // 制限する Web サイト（D-111）。上限に達したあと、Kotlin のユーザー補助がブラウザでこのサイトを止める
    blockedSites: snapshot.blockedSites.map((s) => s.pattern),
    essentialPackages: [...(opts.essentialPackages ?? ESSENTIAL_PACKAGES)],
    learningPackages: [...(opts.learningPackages ?? LEARNING_PACKAGES)],
    configVersion: snapshot.configVersion,
    testPeriods: snapshot.testPeriods.map((t) => ({ name: t.name, startDate: t.startDate, endDate: t.endDate })),
  };
}

// 今日が空白期間の中なら、その空白期間（子どものホームで「夏休み中は制限なし」と出すため）。なければ null
export function currentBlankPeriod(snapshot: ConfigSnapshot | null, today: string) {
  return snapshot?.blankPeriods.find((b) => b.startDate <= today && today <= b.endDate) ?? null;
}

// 次のテスト（今日が期間中ならそのテスト、なければこれから始まる一番近いもの）と、始まるまでの日数（期間中は 0）。なければ null
export function nextTest(
  snapshot: ConfigSnapshot | null,
  today: string,
): { name: string; startDate: string; endDate: string; daysUntil: number; ongoing: boolean } | null {
  if (!snapshot) return null;
  const t = snapshot.testPeriods
    .filter((p) => p.endDate >= today)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0];
  if (!t) return null;
  const ongoing = t.startDate <= today;
  const daysUntil = ongoing ? 0 : Math.round((Date.parse(t.startDate) - Date.parse(today)) / 86_400_000);
  return { name: t.name, startDate: t.startDate, endDate: t.endDate, daysUntil, ongoing };
}

// 契約（contracts/schemas.ts の AppMinutes・UsageDayReport）の上限。ここを超える記録はサーバで 400 になり、送れなくなる
// （アプリの識別子の形と長さは、契約の PackageName をそのまま使って確かめる）
export const APP_LABEL_MAX = 120;
export const REPORT_APPS_MAX = 1000;

// 文字列を max 文字（JavaScript の文字数 = UTF-16 の数。Zod の max と同じ数え方）までに切る。
// 絵文字などの2つで1文字のものを途中で切らないよう、1文字ずつ足していく
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = "";
  for (const ch of text) {
    if (out.length + ch.length > max) break;
    out += ch;
  }
  return out;
}

// 同じアプリ（packageName）が2回出てきたら、使った時間を足して1つにする（名前は最初のもの。順番は最初に出てきた位置）。
// なぜ: #49 の契約では、1日の記録に同じアプリが2回あると形の誤り（UsageDayReport の superRefine）になり、その日の記録が丸ごと
//   隔離されて親に届かなくなる。ふだんの Kotlin（UsageReader）はアプリごとにまとめて返すが、まとめる前の形が来ても落とさないため
function mergeSamePackage<A extends { packageName: string; label: string; usedMinutes: number }>(
  apps: readonly A[],
): A[] {
  const byPackage = new Map<string, A>();
  for (const a of apps) {
    const seen = byPackage.get(a.packageName);
    byPackage.set(a.packageName, seen ? { ...seen, usedMinutes: seen.usedMinutes + a.usedMinutes } : a);
  }
  return [...byPackage.values()];
}

// C2 の実績を、C8 で送る1日ぶんの利用記録の形にする（Q8: アプリ別の累計＋測った時刻＋制限対象の合計分）。
// excluded と restrictedMinutes は C3 と同じ判定で付ける（親の画面はこの合計を使い、新しい設定で過去を計算し直さない）
// 作った記録が必ず契約に合うようにする（なぜ: 合わない記録はサーバで 400 になり、その日の記録が親に届かないため）:
//   - アプリ名（label）は 120 文字までに切る。空ならアプリの識別子（packageName）で代用し、それも 120 文字までに切る
//   - 識別子が契約の PackageName（英数字・"_" を "." でつなぐ形・255 文字まで）に合わないアプリは、1件ずつ一覧から外す
//     （合計の分数には入れる）。なぜ: 1件でも合わないと、その日の記録の全体が 400 になり、送信待ちから外されて届かないため
//   - アプリは 1000 個まで（超えるときは使った時間の多い順に残す。合計の分数は全部のアプリで計算する）
export function toUsageDayReport(
  usage: Extract<NativeUsageResult, { status: "ok" }>,
  excludedPackages: readonly string[],
  essentialPackages: readonly string[] = ESSENTIAL_PACKAGES,
): UsageDayReport {
  const all = mergeSamePackage(usage.apps).map((a) => ({
    packageName: a.packageName,
    label: clipText(a.label.trim() || a.packageName, APP_LABEL_MAX),
    usedMinutes: Math.min(1440, Math.max(0, Math.round(a.usedMinutes))),
    excluded: isExcluded(a.packageName, excludedPackages, essentialPackages),
  }));
  const listed = all.filter((a) => PackageName.safeParse(a.packageName).success && a.label.length > 0);
  // 1000 個を超えるときだけ、使った時間の多い順に並べて切る（ふだんは C2 が返した順のまま）
  const apps =
    listed.length > REPORT_APPS_MAX
      ? [...listed].sort((a, b) => b.usedMinutes - a.usedMinutes).slice(0, REPORT_APPS_MAX)
      : listed;
  return {
    date: usage.date,
    measuredAt: usage.measuredAt,
    restrictedMinutes: Math.min(
      1440,
      all.filter((a) => !a.excluded).reduce((sum, a) => sum + a.usedMinutes, 0),
    ),
    apps,
  };
}
