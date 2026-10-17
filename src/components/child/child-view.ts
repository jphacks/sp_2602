// 子どもの画面（子01 ホーム・子02 使用割合・子11 利用時間が終わった画面・子07 設定）の「表示の決め方」をまとめた純粋な関数。
// 画面（src/app/child/*.tsx）は、ここが返した形をそのまま描くだけにする（判断を画面に書かない。tests/child/ でテストする）。
// 入力は ChildDataProvider（src/lib/child-data.tsx）が持つ C3 の結果・C7 の設定・次のテスト・空白期間。
// 大事な約束:
//   - 子どもには分数を主に見せず「％ 使いました」の割合で見せる（MVP_SPEC 4.2・5.1）
//   - 取れなかった値を 0% と出さない（未設定・制限なし・取得不可・権限なしを別の表示にする。MVP_SPEC 5.3・AC-09）
//   - 文言は責めない言い方にする（「ちょうどいいペース！」「続きはあしたにしよう」）
// React Native を import しない（Vitest で Node のまま動かすため）。
import { addDays, formatDateJa, formatSlashDate, mondayOf, weekdayJa } from "@contracts/dates";
import type { NativePermission, NativePermissionStatus, NativeUsageResult } from "@contracts/native";
import type { BlankPeriod, ConfigSnapshot } from "@contracts/schemas";
import type { ConfigState } from "@/lib/config-cache";
import { calcUsage, limitForDate, type nextTest, type UsageCalc } from "@/lib/usage-calc";

type NextTest = ReturnType<typeof nextTest>;

// 日付の文言（「10月28日（水）」「10/12」）は contracts/dates.ts の formatDateJa・formatSlashDate を使う（アプリで1か所）

// ── 子01・子11「次のテスト」のカード ──────────────────────────

export type NextTestView =
  | { kind: "loading" }
  | { kind: "unknown"; headline: string; detail: string } // 設定が取れていない（「予定なし」とは言えない）
  | { kind: "none"; headline: string; detail: string } // テストが0件（ホームはそのまま使える。MVP_SPEC 5.3）
  | { kind: "test"; headline: string; detail: string; ongoing: boolean };

// 「10月28日（水） 数学」「あと13日」。期間中は「テスト中」（open-questions 2-5 #41: 期間中は日数を数えない）
export function nextTestView(config: ConfigState | null, test: NextTest): NextTestView {
  if (!config) return { kind: "loading" };
  // 設定が手元に1つもないときは、テストがあるかどうか分からない（「予定なし」と言わない）
  if (config.status === "unavailable")
    return { kind: "unknown", headline: "--", detail: "テストの予定を取得できませんでした" };
  if (!test) return { kind: "none", headline: "予定なし", detail: "テストの日程は「日程登録」から入れられます" };
  const headline = `${formatDateJa(test.startDate)} ${test.name}`;
  if (test.ongoing) {
    const detail = test.endDate > test.startDate ? `テスト中（${formatDateJa(test.endDate)}まで）` : "テスト中";
    return { kind: "test", headline, detail, ongoing: true };
  }
  return { kind: "test", headline, detail: `あと${test.daysUntil}日`, ongoing: false };
}

// ── 子01・子02・子11「今日の使用量」 ───────────────────────────

// 割合が出せないときに出す案内（action: permission = 使用状況へのアクセスの設定を開く / retry = 取り直す）
export type UsageMessage = {
  title: string;
  body: string;
  tone: "info" | "warning";
  icon: "info" | "lock" | "cloud_off" | "warning" | "check_circle";
  action: { kind: "permission"; label: string } | { kind: "retry"; label: string } | null;
};

export type UsageView =
  | { kind: "loading" }
  | { kind: "percent"; percent: number; reached: boolean } // 「46 ％ 使いました」
  | { kind: "message"; reason: Exclude<UsageCalc["state"], "ok">; message: UsageMessage };

// C3 の結果 → 「今日の使用量」に出すもの。blank は今日が入っている空白期間（名前を「（夏休み）」のように添える。Q7）
export function usageView(calc: UsageCalc | null, blank: Pick<BlankPeriod, "name"> | null): UsageView {
  if (!calc) return { kind: "loading" };
  switch (calc.state) {
    case "ok":
      return { kind: "percent", percent: calc.displayUsedPercent, reached: calc.reached };
    case "unlimited":
      // Figma にない状態。カードの見た目は同じで、数字の代わりに文で出す（0% ではない）
      return {
        kind: "message",
        reason: calc.state,
        message: {
          title: blank ? `今日は制限なし（${blank.name}）` : "今日は制限なし",
          body: "今日は使える時間の上限がありません",
          tone: "info",
          icon: "check_circle",
          action: null,
        },
      };
    case "limit_unset":
      // 親がまだ1日の上限（通常上限）を決めていない（Q7）。0% と出さない
      return {
        kind: "message",
        reason: calc.state,
        message: {
          title: "まだ1日の時間が決まっていません",
          body: "おうちの人が決めると、ここに使った割合が出ます",
          tone: "info",
          icon: "info",
          action: null,
        },
      };
    case "permission_denied":
      return {
        kind: "message",
        reason: calc.state,
        message: {
          title: "使用状況へのアクセスを許可してください",
          body: "使った時間を測るために必要です。設定画面で Slope をオンにしてください",
          tone: "warning",
          icon: "lock",
          action: { kind: "permission", label: "設定を開く" },
        },
      };
    case "usage_unavailable":
      // reason は開発向けの文（Kotlin の部品がない など）なので子どもには出さない
      return {
        kind: "message",
        reason: calc.state,
        message: {
          title: "使った時間を取得できませんでした",
          body: "しばらくしてから、もう一度ためしてください",
          tone: "warning",
          icon: "cloud_off",
          action: { kind: "retry", label: "もう一度ためす" },
        },
      };
    case "limit_unknown":
      return {
        kind: "message",
        reason: calc.state,
        message: {
          title: "今日の時間を取得できませんでした",
          body: "通信できる場所で、もう一度ためしてください",
          tone: "warning",
          icon: "cloud_off",
          action: { kind: "retry", label: "もう一度ためす" },
        },
      };
    case "limit_invalid":
      return {
        kind: "message",
        reason: calc.state,
        message: {
          title: "今日の時間の設定が正しくありません",
          body: "おうちの人に確かめてもらってください",
          tone: "warning",
          icon: "warning",
          action: null,
        },
      };
  }
}

// 設定が「最新でない可能性」の帯を出すか。起動直後に端末の保存分を読んだだけ（not_checked）のときは、
// すぐ通信で確かめ直すので出さない（デモの最初に一瞬だけ注意の帯がちらつくのを避ける）
export function staleNotice(config: ConfigState | null): { message: string; hint: string } | null {
  if (config?.status !== "stale" || config.reason === "not_checked") return null;
  return { message: "最新でない可能性があります", hint: "通信できるようになると自動で更新します" };
}

// 上限に達したときの案内の文（子11 のバナー・子01 の上の帯）
export const LIMIT_REACHED_MESSAGE = "今日のスマホの時間は終わりです。続きはあしたにしよう";

// ── 子02「ちょうどいいペース！」 ───────────────────────────────

export type PaceView = {
  label: string;
  tone: "success" | "info";
  icon: "check_circle" | "clock" | "info";
};

// TODO(未決): Q23 子02 の「ちょうどいいペース！」の判定は決まっていない。
//   仮の判定は open-questions.md の Q23 の仮の値 B（使った割合だけで決める。時刻は使わない）:
//     0〜60%  →「ちょうどいいペース！」/ 61〜99% →「ゆっくり使おう」/ 到達 →「今日はここまで。また明日！」
//   時刻を使う案（A）にしないのは、同じ割合でも見る時刻で文言が変わり、テストもデモも安定しないため。
//   どちらの文言も責めない言い方にする（赤・警告の色は使わない）。割合が出せない状態ではチップを出さない（null）
export const PACE_GOOD_MAX_PERCENT = 60;

export function paceView(calc: UsageCalc | null): PaceView | null {
  if (calc?.state !== "ok") return null;
  if (calc.reached) return { label: "今日はここまで。また明日！", tone: "info", icon: "info" };
  if (calc.displayUsedPercent <= PACE_GOOD_MAX_PERCENT)
    return { label: "ちょうどいいペース！", tone: "success", icon: "check_circle" };
  return { label: "ゆっくり使おう", tone: "info", icon: "clock" };
}

// ── 子02「今週の使用割合」の棒グラフ ───────────────────────────

// BarChart（src/components/BarChart.tsx）の Bar と同じ形（ここは React Native を import しないので形だけ写す）
export type WeekBar = {
  key: string;
  label: string; // 曜日「月」
  sublabel: string; // 「10/12」
  value: number | null; // 使った割合（0〜100）。null = 棒を描かない（未来・取れない日・制限なしの日）
  capacity: number; // いつも 100（割合なので下地は一番上まで）
  topLabel?: string; // 取れない日は「--」、制限なしの日は「なし」。ふだんは出さない（Figma に数字はない）
  highlight: boolean; // 今日（濃い青・太字）
};

// 今日を含む週（月〜日）の日付
export function weekDates(today: string): string[] {
  const monday = mondayOf(today);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

// ある過去の日の割合を、端末の記録（C2）とその日の日別上限（C7 の dailyLimits）から出す（C3 と同じ計算）。
// TODO(未決): 対象外アプリは「今の設定」で数える（端末はその日の対象外の設定を残していない）。親の画面はサーバに送った合計を使う
export function dayCalc(usage: NativeUsageResult, snapshot: ConfigSnapshot | null, date: string): UsageCalc {
  return calcUsage({
    usage,
    limit: limitForDate(snapshot, date),
    excludedPackages: snapshot?.excludedApps.map((a) => a.packageName) ?? [],
  });
}

// days: 日付 → その日の C3 の結果（undefined = まだ読み込み中）。今日より後の日は下地だけ
export function weekBars(today: string, days: Readonly<Record<string, UsageCalc | null | undefined>>): WeekBar[] {
  return weekDates(today).map((date) => {
    const base = {
      key: date,
      label: weekdayJa(date),
      sublabel: formatSlashDate(date),
      capacity: 100,
      highlight: date === today,
    };
    if (date > today) return { ...base, value: null };
    const c = days[date];
    if (c === undefined) return { ...base, value: null }; // 読み込み中（「--」は出さない）
    if (c?.state === "ok") return { ...base, value: c.displayUsedPercent };
    if (c?.state === "unlimited") return { ...base, value: null, topLabel: "なし" };
    return { ...base, value: null, topLabel: "--" };
  });
}

// 読み上げ用の説明（「月曜 72パーセント、火曜 記録なし…」）
export function weekBarsLabel(bars: readonly WeekBar[]): string {
  const parts = bars.map((b) => {
    const v =
      b.value != null
        ? `${b.value}パーセント`
        : b.topLabel === "なし"
          ? "制限なし"
          : b.topLabel === "--"
            ? "記録なし"
            : "まだなし";
    return `${b.label}曜 ${v}`;
  });
  return `今週の使用割合。${parts.join("、")}`;
}

// ── 子01 → 子11 への自動の案内（C4） ───────────────────────────

// 上限に達したら、その日に1回だけ 子11 を出す（閉じた後にホームへ戻るたびに出し直さない）。
// shownForDate は前に 子11 を出した日（まだなら null）
export function shouldOpenLimitScreen(calc: UsageCalc | null, today: string, shownForDate: string | null): boolean {
  return calc?.state === "ok" && calc.reached && shownForDate !== today;
}

// ── 子01「見守りのための許可」（C4） ─────────────────────────────

// 上限に届いたときに案内を出すための許可のうち、まだのもの（許可してほしい順）。Figma にない案内（実機の都合で足した）。
// 使用状況へのアクセス（usageAccess）は「今日の使用量」のカードが案内するので、ここには入れない（同じ案内を2回出さない）。
// Kotlin の部品がない端末（available = false。Expo Go・テスト）では出さない（許可しても何も変わらないため）
export type PermissionGuideItem = {
  permission: Exclude<NativePermission, "usageAccess">;
  title: string;
  body: string;
};

const PERMISSION_GUIDE: readonly PermissionGuideItem[] = [
  {
    permission: "overlay",
    title: "ほかのアプリの上に表示",
    body: "時間が終わったときに、Slope の案内を出すために使います",
  },
  {
    permission: "notifications",
    title: "通知",
    body: "見守っていることと、時間が終わったことをお知らせします",
  },
  {
    permission: "batteryOptimization",
    title: "電池の最適化をオフ",
    body: "見守りが途中で止まらないようにします",
  },
];

export function permissionGuide(permissions: NativePermissionStatus | null, available: boolean): PermissionGuideItem[] {
  if (!available || !permissions) return [];
  return PERMISSION_GUIDE.filter((item) => !permissions[item.permission]);
}

// ── 子11「お勧めアプリはこちらです」 ──────────────────────────

// 開くアプリの一覧は LEARNING_PACKAGES（src/lib/usage-calc.ts。C4 で Kotlin に渡す学習用アプリと同じ1つの一覧）

// 一覧の上から順に開けるか試す。どれかが開けたら true（Kotlin がない・どれも入っていないときは false）
export function openFirstApp(packages: readonly string[], open: (packageName: string) => boolean): boolean {
  return packages.some((p) => open(p));
}

// ── 子07 設定 ─────────────────────────────────────────

// 「テスト日程の一覧・変更」の右の件数（「1件」）。設定が取れていないときは出さない（0件と言わない）
export function testCountLabel(config: ConfigState | null): string | undefined {
  if (!config || config.status === "unavailable") return undefined;
  return `${config.snapshot.testPeriods.length}件`;
}

// テーマカラーの選択肢（子06）。Q13: 選べるのは白だけ（黒はダークテーマで、MVP の後）
export const THEME_OPTIONS = [
  { key: "white", label: "白色", enabled: true },
  { key: "black", label: "黒色", enabled: false },
] as const;
export type ThemeKey = (typeof THEME_OPTIONS)[number]["key"];
