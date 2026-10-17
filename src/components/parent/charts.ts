// 保護者の画面の棒グラフのデータ作り（純粋な関数。tests/parent/charts.test.ts）。描くのは WeekBars.tsx。
//   - homeWeekBars : 親01「今週の使用時間（分）」。月〜日の7本。下地 = その日の上限、中身 = 使った時間
//   - reviewWeekBars: 親03「週ごとの1日の使用時間（平均・分）」。6週。計画の前の週は淡い色
//   - planTrendBars: 親02 で「今の計画だと上限はこう下がる」。サーバの日別上限（C10 の結果）を何日かおきに拾う（ここで C10 を計算し直さない）
// 取り違えないための決まり（C6・Q7）:
//   - 記録がない日（recorded: false）は中身を描かず missing（「？」の印）。0 分の記録は高さ 0 の中身（印なし）
//   - 上限が「制限なし」の日は下地を描かず、上の数字は「なし」。「上限未設定」の日も下地を描かず、上の数字は「－」
import { addDays, datesInRange, mondayOf, weekdayJa } from "@contracts/dates";
import type { ConfigSnapshot, DailyLimit, DayLimit, UsageDay } from "@contracts/schemas";
import { md } from "./format";

export type BarTag = { label: string; tone: "strong" | "soft" };

export type ChartBar = {
  key: string;
  label: string; // 下の1行目（曜日・週の日付）
  sublabel?: string; // 下の2行目（日付）
  topLabel: string; // 棒の上の文字（上限の分数・「なし」・「－」など）
  track: number | null; // 下地の高さに使う値（上限。null = 下地を描かない）
  value: number | null; // 中身の高さに使う値（使った時間。null = 描かない）
  fill: "muted" | "strong"; // 中身の色（淡い青 / 青）
  emphasis: boolean; // 今日・今週（文字を青・太字に）
  missing: boolean; // 記録が届いていない（「？」の印を出す）
  tags: BarTag[]; // 一番下の札（「今週」「前の試験」など）
  a11y: string; // 読み上げの文
};

// 上限の値から、下地の高さと上の文字を作る
function limitParts(limit: DayLimit | null | undefined): { track: number | null; topLabel: string; text: string } {
  if (!limit) return { track: null, topLabel: "－", text: "上限未設定" };
  if (limit.kind === "unlimited") return { track: null, topLabel: "なし", text: "制限なし" };
  return { track: limit.limitMinutes, topLabel: String(limit.limitMinutes), text: `上限 ${limit.limitMinutes}分` };
}

// ── 親01: 今週の使用時間（分）──
// days は usageGet（月曜〜日曜）の結果。今日より後の日は中身を描かない（未来）
export function homeWeekBars(days: readonly UsageDay[], today: string): ChartBar[] {
  const monday = mondayOf(today);
  const byDate = new Map(days.map((d) => [d.date, d]));
  return datesInRange(monday, addDays(monday, 6)).map((date) => {
    const day = byDate.get(date);
    const lp = limitParts(day?.limit ?? null);
    const future = date > today;
    const recorded = !!day?.recorded && day.usedMinutes != null;
    const value = !future && recorded ? (day?.usedMinutes ?? null) : null;
    const usedText = future ? "これから" : recorded ? `使った時間 ${value}分` : "記録なし";
    return {
      key: date,
      label: weekdayJa(date),
      sublabel: md(date),
      topLabel: lp.topLabel,
      track: lp.track,
      value,
      fill: date === today ? "strong" : "muted",
      emphasis: date === today,
      missing: !future && !recorded,
      tags: [],
      a11y: `${md(date)}（${weekdayJa(date)}）${date === today ? "今日" : ""}、${lp.text}、${usedText}`,
    };
  });
}

// ── 親03: 週ごとの1日の使用時間（平均・分）──

export const REVIEW_WEEKS_BEFORE = 3; // 今週より前に出す週の数（Figma 親03: 9/21・9/28・10/5）
export const REVIEW_WEEKS_AFTER = 2; // 今週より後に出す週の数（Figma 親03: 10/19・10/26）

// 振り返りで usageGet に渡す期間（6週ぶん。190日の上限より十分短い）
export function reviewRange(today: string): { from: string; to: string } {
  const monday = mondayOf(today);
  return { from: addDays(monday, -7 * REVIEW_WEEKS_BEFORE), to: addDays(monday, 7 * REVIEW_WEEKS_AFTER + 6) };
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

// 1週ぶんの平均。使った時間は「今日までの記録がある日」だけで割る（記録がない日を 0 分として混ぜない）。
// 上限は「上限ありの日」だけの平均。上限ありの日がなく、制限なしの日があれば unlimited
export function weekAverages(
  days: readonly UsageDay[],
  today: string,
): { used: number | null; limit: number | null; unlimited: boolean } {
  const used = avg(
    days.filter((d) => d.date <= today && d.recorded && d.usedMinutes != null).map((d) => d.usedMinutes ?? 0),
  );
  const limited = days.flatMap((d) => (d.limit?.kind === "limited" ? [d.limit.limitMinutes] : []));
  const limit = avg(limited);
  const unlimited = limit == null && days.some((d) => d.limit?.kind === "unlimited");
  return { used, limit, unlimited };
}

export type ReviewMarks = {
  planStartDate: string | null; // 計画の開始日（この日を含む週から「計画の中」）
  prevTestStart: string | null; // 前の試験の開始日（その週に「前の試験」の札）
  nextTestStart: string | null; // 今の試験の開始日（その週に「今の試験」の札）
};

// TODO(未決): 棒の上の数字の意味（screens-text 6章 20）。Figma どおり「計画の前の週は使った時間の平均、計画の中の週は上限の平均」にした
export function reviewWeekBars(days: readonly UsageDay[], today: string, marks: ReviewMarks): ChartBar[] {
  const { from } = reviewRange(today);
  const thisMonday = mondayOf(today);
  const weeks = REVIEW_WEEKS_BEFORE + 1 + REVIEW_WEEKS_AFTER;
  const inWeek = (date: string | null, monday: string) => !!date && monday <= date && date <= addDays(monday, 6);
  return Array.from({ length: weeks }, (_, i) => {
    const monday = addDays(from, 7 * i);
    const sunday = addDays(monday, 6);
    const weekDays = days.filter((d) => monday <= d.date && d.date <= sunday);
    const a = weekAverages(weekDays, today);
    const current = monday === thisMonday;
    const future = monday > today;
    // 計画の前: 計画がない、またはその週が計画の開始日より前に終わっている
    const pre = !marks.planStartDate || sunday < marks.planStartDate;
    const tags: BarTag[] = [];
    if (inWeek(marks.prevTestStart, monday)) tags.push({ label: "前の試験", tone: "soft" });
    if (current) tags.push({ label: "今週", tone: "strong" });
    if (inWeek(marks.nextTestStart, monday)) tags.push({ label: "今の試験", tone: "soft" });
    const limitText = a.limit != null ? `上限の平均 ${a.limit}分` : a.unlimited ? "制限なし" : "上限未設定";
    const usedText = future ? "これから" : a.used != null ? `使った時間の平均 ${a.used}分` : "記録なし";
    const topLabel = pre
      ? a.used != null
        ? String(a.used)
        : "－"
      : a.limit != null
        ? String(a.limit)
        : a.unlimited
          ? "なし"
          : "－";
    return {
      key: monday,
      label: md(monday),
      topLabel,
      // 計画の前の週は上限の下地を描かない（Figma 親03 の淡い棒だけの見え方）
      track: pre ? null : a.limit,
      value: future ? null : a.used,
      fill: pre ? "muted" : "strong",
      emphasis: current,
      missing: !future && a.used == null,
      tags,
      a11y: `${md(monday)}の週${current ? "（今週）" : ""}${pre ? "、計画の前" : ""}、${limitText}、${usedText}`,
    };
  });
}

// ── 親02: 今の計画での上限の下がり方 ──

export const TREND_BARS = 6;
export const TREND_DEFAULT_DAYS = 27; // 最後のテストがないときに見る日数（4週間）

// サーバの日別上限（C10 の結果）から、今日〜最後のテストの開始日（最終目標になる日）までを、何日かおきに拾う。
// クライアントで C10 を計算し直さない（拾うだけ）。日別上限がまだない日は「－」
export function planTrendBars(
  snapshot: Pick<ConfigSnapshot, "dailyLimits" | "testPeriods">,
  today: string,
  maxBars: number = TREND_BARS,
): ChartBar[] {
  const byDate = new Map<string, DailyLimit>(snapshot.dailyLimits.map((l) => [l.date, l]));
  const upcoming = snapshot.testPeriods.filter((t) => t.startDate >= today);
  const lastTest = upcoming.reduce<string | null>((acc, t) => (!acc || t.startDate > acc ? t.startDate : acc), null);
  const lastKnown = snapshot.dailyLimits.at(-1)?.date ?? today;
  let end = lastTest ?? addDays(today, TREND_DEFAULT_DAYS);
  if (end > lastKnown) end = lastKnown < today ? today : lastKnown;
  const span = Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000);
  const n = Math.max(1, Math.min(maxBars, span + 1));
  const dates = [
    ...new Set(Array.from({ length: n }, (_, i) => addDays(today, n === 1 ? 0 : Math.round((i * span) / (n - 1))))),
  ];
  const testStarts = new Map(snapshot.testPeriods.map((t) => [t.startDate, t.name]));
  return dates.map((date) => {
    const l = byDate.get(date);
    const lp = limitParts(l ?? null);
    const test = testStarts.get(date);
    const tags: BarTag[] = [];
    if (date === today) tags.push({ label: "今日", tone: "strong" });
    if (test) tags.push({ label: "テスト", tone: "soft" });
    return {
      key: date,
      label: weekdayJa(date),
      sublabel: md(date),
      topLabel: lp.topLabel,
      // 上限そのものを見せるグラフなので、上限を中身として塗る（坂のように下がるのが分かるように）
      track: lp.track,
      value: lp.track,
      fill: date === today ? "strong" : "muted",
      emphasis: date === today,
      missing: false,
      tags,
      a11y: `${md(date)}（${weekdayJa(date)}）${test ? `、${test}の始まり` : ""}、${lp.text}`,
    };
  });
}

// グラフの下に出す注記（その印が1本でもあるときだけ）
export function chartNotes(bars: readonly ChartBar[]): string[] {
  const notes: string[] = [];
  if (bars.some((b) => b.missing)) notes.push("？：記録がまだ届いていない日");
  if (bars.some((b) => b.topLabel === "なし")) notes.push("なし：制限なし（空白期間）");
  if (bars.some((b) => b.topLabel === "－")) notes.push("－：上限が決まっていない・記録がない");
  return notes;
}
