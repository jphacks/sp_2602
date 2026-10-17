// 親01 ホームの「今日の使用量」と、親09 アプリごとの利用時間 の中身を作る（純粋な関数。tests/parent/today.test.ts）。
// C6: 記録なし・0 分・取得不可を区別する。取れなかった値を 0 分と出さない（MVP_SPEC 4.2・5.3）。
//   記録なし（recorded: false）: 「まだ記録が届いていません」。0 分の記録とは別
//   0 分の記録                : 「0 分」と出す
//   取得不可（通信の失敗）     : 画面側で StateView unknown（ここには来ない）
// 上限は3つの状態を取り違えない（Q7）: 上限あり（0 分も有効）/ 制限なし（空白期間）/ 上限未設定
import type { AppMinutes, DayLimit, UsageDay } from "@contracts/schemas";

export type LimitView = { kind: "limited"; minutes: number } | { kind: "unlimited" } | { kind: "unset" };

export function limitViewOf(limit: DayLimit | null): LimitView {
  if (!limit) return { kind: "unset" };
  return limit.kind === "unlimited" ? { kind: "unlimited" } : { kind: "limited", minutes: limit.limitMinutes };
}

// 「上限 260分」「制限なし」「上限未設定」（Figma 親01「120 分 ／ 上限 260分」の後ろ半分）
export function limitText(limit: LimitView): string {
  if (limit.kind === "limited") return `上限 ${limit.minutes}分`;
  return limit.kind === "unlimited" ? "制限なし" : "上限未設定";
}

export type TodaySummary =
  | { kind: "missing" } // 今日の行が応答にない（期間の指定違いなど。取得不可として扱う）
  | { kind: "no_record"; limit: LimitView } // まだ記録が届いていない
  | {
      kind: "recorded";
      usedMinutes: number;
      measuredAt: string | null;
      limit: LimitView;
      percent: number | null; // 進捗バーの割合（0〜100）。上限がない（制限なし・未設定）なら null = バーを出さない
    };

// 進捗バーの割合。上限 0 分は到達扱いで 100%（0 で割らない。MVP_SPEC 4.2）
export function usedPercent(usedMinutes: number, limit: LimitView): number | null {
  if (limit.kind !== "limited") return null;
  if (limit.minutes <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((usedMinutes / limit.minutes) * 100)));
}

export function todaySummary(day: UsageDay | undefined): TodaySummary {
  if (!day) return { kind: "missing" };
  const limit = limitViewOf(day.limit);
  if (!day.recorded || day.usedMinutes == null) return { kind: "no_record", limit };
  return {
    kind: "recorded",
    usedMinutes: day.usedMinutes,
    measuredAt: day.measuredAt,
    limit,
    percent: usedPercent(day.usedMinutes, limit),
  };
}

// 親09 のアプリの1行
export type AppRow = {
  packageName: string;
  label: string;
  initial: string; // 頭文字のアイコンに出す1文字
  minutes: number;
  barPercent: number; // 横棒の長さ（一番多いアプリを 100 とした割合。Figma 親09 の見え方）
};

// 頭文字（サロゲートペアの絵文字でも1文字として取る）
export function initialOf(label: string): string {
  return Array.from(label.trim())[0] ?? "?";
}

// アプリ別の分数を、制限の対象（合計に入る）と対象外（合計に入らない）に分けて、多い順に並べる。
// 横棒の長さは両方を通して一番多いアプリを 100 にする（同じ物差しで比べられるように）
export function appUsageRows(apps: readonly AppMinutes[]): { restricted: AppRow[]; excluded: AppRow[] } {
  const max = Math.max(0, ...apps.map((a) => a.usedMinutes));
  const toRow = (a: AppMinutes): AppRow => ({
    packageName: a.packageName,
    label: a.label,
    initial: initialOf(a.label),
    minutes: a.usedMinutes,
    barPercent: max > 0 ? Math.round((a.usedMinutes / max) * 100) : 0,
  });
  const byMinutes = (a: AppMinutes, b: AppMinutes) => b.usedMinutes - a.usedMinutes;
  return {
    restricted: apps
      .filter((a) => !a.excluded)
      .sort(byMinutes)
      .map(toRow),
    excluded: apps
      .filter((a) => a.excluded)
      .sort(byMinutes)
      .map(toRow),
  };
}
