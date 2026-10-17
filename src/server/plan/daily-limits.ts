// C10: 日別上限の計算（MVP_SPEC 4.4 と仕様の決定 Q7）。通常上限・親の計画（開始日・S・G）・テスト期間・空白期間から、日ごとの上限を作る。
// 画面・保存から切り離した純粋な関数にしてある（同じ入力なら必ず同じ結果。tests/server/daily-limits.test.ts で確かめる）。
// 保存（昨日以前の値を守る・版を上げる）は src/server/mock/store.ts が、この関数の結果と mergeWithFinalized を使って行う。
//
// 1日の上限は3つの状態のどれか（Q7）: limited（上限あり。0 分も有効）/ unlimited（空白期間中で制限なし）/ 一覧にない（上限未設定）
//
// 式（MVP_SPEC 4.4）:
//   基準曲線 B(d) = S − (S − G)·u²、u = clamp((d − d0) / D, 0, 1)。d0 = 計画開始日、D = d0 から最後のテストの開始日までの日数
//   テスト i の開始日の目標 Qᵢ = B(開始日)（最後のテストは G）。テスト期間中は Qᵢ を維持する
//   最後のテストが始まったら G、終了日の翌日から通常上限に戻す
//   最後ではないテストの終了後: rᵢ = clamp(0.8(1 − u_end²), 0, 0.8)（u_end はテスト終了日の u）、
//     Rᵢ = Qᵢ + rᵢ(Pᵢ − Qᵢ)（Pᵢ は前の回復のピーク。最初は P₁ = S）。終了の翌日を Rᵢ とし、次のテストの開始日の目標まで実日数で線形補間する
//   連続したテスト（終了の翌日が次の開始日）では回復しない
//   途中は丸めずに計算し、最後に分単位の整数へ丸める
//   計画がない・テスト期間が0件なら、すべての日を親の通常上限にする（通常上限も未設定なら「上限未設定」）
//   空白期間の日は、上の計算に関係なく「制限なし」。空白期間が終わった日からは、上の計算の値（元の上限）に戻る（Q7）
import { addDays, datesInRange, daysBetween } from "../../../contracts/dates.js";
import type { DailyLimit } from "../../../contracts/schemas.js";

// Existing MVP behavior; exact product horizon remains unresolved in MVP_SPEC.
export const LIMIT_HORIZON_DAYS = 120;

// 計算に使う計画の値（D8。Q14 で開始日・S・G の3つ）
export type PlanInput = {
  planStartDate: string; // d0
  startLimitMinutes: number; // S
  finalGoalMinutes: number; // G
};

// 計算に使う期間（開始日・終了日ともにその日を含む）
export type PeriodInput = { startDate: string; endDate: string };
export type BlankInput = PeriodInput & { id: string };

// 計算の入力一式
export type LimitInputs = {
  usualLimitMinutes: number | null; // 通常上限（null = 親がまだ決めていない）
  plan: PlanInput | null; // 計画（null = まだない）
  testPeriods: PeriodInput[];
  blankPeriods: BlankInput[];
};

// 未決の点を変えられるようにした引数。既定値はすべて仮置き（TODO(未決)）
export type DailyLimitOptions = {
  // TODO(未決): 最初のテストより前の日を、基準曲線 B(d) に沿わせるか（"curve"）、S から Q₁ へ線形にするか（"linear"）。
  //   式の説明（「基準曲線（計画開始から最終テスト開始まで）」）から、既定は "curve"
  firstSegment?: "curve" | "linear";
  // TODO(未決): 計画開始日より前の日の上限。既定は通常上限（"usual"）。"start" なら S
  beforePlanStart?: "usual" | "start";
  // MVP決定: 日別上限の確定時は分単位で切り捨てる。
  rounding?: "round" | "floor" | "ceil";
  // TODO(未決): 1日に下げてよい最大の幅（分）（MVP_SPEC 4.4「最大日次減少幅」）。既定は null = 制限しない
  maxDailyDecrease?: number | null;
  // maxDailyDecrease を使うとき、from の前日の上限（確定済みの値）。分からなければ省く
  previousDayLimit?: number | null;
  // TODO(未決): 連続テストで回復しなかったとき、次の回復で使うピーク P。既定は "keep"（前のピークのまま）。"test" なら直前のテストの上限 Q
  consecutivePeak?: "keep" | "test";
};

// 計算できない入力（保存しない。前の正式な版を保つ）
export class PlanCalcError extends Error {
  constructor(
    readonly reason: "overlap" | "zero_span" | "invalid_range",
    message: string,
  ) {
    super(message);
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const isCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};
const byStart = <T extends PeriodInput>(a: T, b: T) =>
  a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0;

// 期間を開始日順に並べ、終了日の逆転と重なりを確かめる
function sortedNoOverlap<T extends PeriodInput>(periods: T[], what: string): T[] {
  const sorted = [...periods].sort(byStart);
  for (const p of sorted)
    if (!isCalendarDate(p.startDate) || !isCalendarDate(p.endDate) || p.endDate < p.startDate)
      throw new PlanCalcError("invalid_range", `日付が不正、または終了日が開始日より前の${what}があります`);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev && cur && cur.startDate <= prev.endDate)
      throw new PlanCalcError("overlap", `${what}が重なっています。期間を見直してください`);
  }
  return sorted;
}

// C10 の対象になるテスト期間を選び、開始日順に並べ、重なりを確かめる。
// TODO(未決): 「有効なテスト」の条件（FigJam の図の矛盾 17）。今は「開始日が計画開始日以降のもの」だけを使い、それより前のテストは無視する。
// TODO(未決): 重なる期間・同じ日の期間の扱い（MVP_SPEC 9章 High）。今は重なりを計算できない入力（overlap）として断る
export function selectPeriods(plan: PlanInput, periods: PeriodInput[]): PeriodInput[] {
  if (!isCalendarDate(plan.planStartDate)) throw new PlanCalcError("invalid_range", "計画開始日が不正です");
  const all = normalizeTestPeriods(periods);
  if (all.length > 0 && (all[all.length - 1]?.startDate ?? "") < plan.planStartDate)
    throw new PlanCalcError("invalid_range", "最後のテスト開始日は計画開始日以降にしてください");
  const eligible = all.filter((p) => p.startDate >= plan.planStartDate);
  const merged: PeriodInput[] = [];
  for (const period of eligible) {
    const previous = merged.at(-1);
    // Multiple exams registered on the same day are one logical test date.
    if (previous?.startDate === period.startDate && previous.endDate === period.endDate) continue;
    merged.push(period);
  }
  return merged;
}

function normalizeTestPeriods(periods: PeriodInput[]): PeriodInput[] {
  const uniqueByRange = new Map(periods.map((period) => [`${period.startDate}|${period.endDate}`, period]));
  return sortedNoOverlap([...uniqueByRange.values()], "テスト期間");
}

function isWeekend(date: string): boolean {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function noWeekdayBetween(endDate: string, nextStartDate: string): boolean {
  for (let date = addDays(endDate, 1); date < nextStartDate; date = addDays(date, 1)) {
    if (!isWeekend(date)) return false;
  }
  return true;
}

// 空白期間を除いた、1日ぶんの丸める前の上限を返す関数を作る（null = 上限未設定）。入力の検査もここで行う
export function buildRawLimit(
  inputs: Pick<LimitInputs, "usualLimitMinutes" | "plan" | "testPeriods">,
  opts: DailyLimitOptions = {},
): (date: string) => number | null {
  const usual = inputs.usualLimitMinutes;
  const plan = inputs.plan;
  // 計画がない: 通常上限（未設定なら null）
  if (!plan) {
    normalizeTestPeriods(inputs.testPeriods);
    return () => usual;
  }

  const S = plan.startLimitMinutes;
  const G = plan.finalGoalMinutes;
  const d0 = plan.planStartDate;
  const before = (opts.beforePlanStart ?? "usual") === "usual" ? usual : S;
  const tests = selectPeriods(plan, inputs.testPeriods);

  // テスト期間が0件: 親の通常上限（MVP_SPEC 4.3「0件は未設定と同義ではない」）
  if (tests.length === 0) return () => usual;

  const last = tests[tests.length - 1] as PeriodInput;
  const D = daysBetween(d0, last.startDate);
  if (D < 0) throw new PlanCalcError("invalid_range", "最後のテスト開始日は計画開始日以降にしてください");

  const u = (d: string) => (D === 0 ? 1 : clamp(daysBetween(d0, d) / D, 0, 1));
  const B = (d: string) => S - (S - G) * u(d) ** 2;
  const Q = tests.map((t, i) => (i === tests.length - 1 ? G : B(t.startDate)));

  // 区間を前から順に作る。各区間は「その日の値を返す関数」と、効く日付の範囲を持つ
  type Segment = { from: string; to: string; value: (d: string) => number };
  const segments: Segment[] = [];
  const first = tests[0] as PeriodInput;
  const Q1 = Q[0] as number;
  if (d0 < first.startDate) {
    const span = daysBetween(d0, first.startDate);
    segments.push({
      from: d0,
      to: addDays(first.startDate, -1),
      value: (opts.firstSegment ?? "curve") === "curve" ? B : (d) => S + ((Q1 - S) * daysBetween(d0, d)) / span,
    });
  }
  let P = S; // 前の回復のピーク
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i] as PeriodInput;
    const q = Q[i] as number;
    if (i === tests.length - 1) {
      // 最後のテスト期間中は G を維持し、終了日の翌日から通常上限に戻す。
      segments.push({ from: t.startDate, to: t.endDate, value: () => G });
      break;
    }
    segments.push({ from: t.startDate, to: t.endDate, value: () => q });
    const next = tests[i + 1] as PeriodInput;
    const qNext = Q[i + 1] as number;
    const recoveryDay = addDays(t.endDate, 1);
    if (noWeekdayBetween(t.endDate, next.startDate)) {
      // Keep the finished test's cap across a weekend-only gap. Without
      // a segment, the gap falls through to the plan's start limit.
      if (recoveryDay < next.startDate) {
        segments.push({ from: recoveryDay, to: addDays(next.startDate, -1), value: () => q });
      }
      if ((opts.consecutivePeak ?? "keep") === "test") P = q;
      continue;
    }
    const uEnd = u(t.endDate);
    const r = clamp(0.8 * (1 - uEnd ** 2), 0, 0.8);
    const R = q + r * (P - q);
    const span = daysBetween(recoveryDay, next.startDate);
    segments.push({
      from: recoveryDay,
      to: addDays(next.startDate, -1),
      value: (d) => R + ((qNext - R) * daysBetween(recoveryDay, d)) / span,
    });
    P = R;
  }

  return (date: string) => {
    if (date < d0) return before;
    if (date > last.endDate) return usual;
    const seg = segments.find((s) => s.from <= date && date <= s.to);
    return seg ? seg.value(date) : S;
  };
}

const roundBy = (mode: DailyLimitOptions["rounding"]) =>
  mode === "ceil" ? Math.ceil : mode === "round" ? Math.round : Math.floor;

// from〜to（両端を含む）の日別上限を作る。上限未設定の日は結果に入れない。limited の値は 0〜1440 の整数（分）
export function computeDailyLimits(
  inputs: LimitInputs,
  from: string,
  to: string,
  opts: DailyLimitOptions = {},
): DailyLimit[] {
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to)
    throw new PlanCalcError("invalid_range", "計算対象の日付範囲が不正です");
  if (
    inputs.usualLimitMinutes !== null &&
    (!Number.isInteger(inputs.usualLimitMinutes) || inputs.usualLimitMinutes < 0 || inputs.usualLimitMinutes > 1440)
  )
    throw new PlanCalcError("invalid_range", "通常上限は0〜1440分の整数にしてください");
  if (
    inputs.plan &&
    [inputs.plan.startLimitMinutes, inputs.plan.finalGoalMinutes].some(
      (limit) => !Number.isInteger(limit) || limit < 0 || limit > 1440,
    )
  )
    throw new PlanCalcError("invalid_range", "計画上限は0〜1440分の整数にしてください");
  const raw = buildRawLimit(inputs, opts);
  // TODO(未決): 空白期間どうしが重なるときの扱い。今はテスト期間と同じく計算できない入力として断る
  const blanks = sortedNoOverlap(inputs.blankPeriods, "空白期間");
  const round = roundBy(opts.rounding);
  const out: DailyLimit[] = [];
  let prev = opts.previousDayLimit ?? null;
  for (const date of datesInRange(from, to)) {
    const blank = blanks.find((b) => b.startDate <= date && date <= b.endDate);
    if (blank) {
      out.push({ date, kind: "unlimited", blankPeriodId: blank.id });
      continue;
    }
    const r = raw(date);
    if (r == null) continue; // 上限未設定
    let v = clamp(round(r), 0, 1440);
    if (opts.maxDailyDecrease != null && prev != null) v = Math.max(v, prev - opts.maxDailyDecrease);
    out.push({ date, kind: "limited", limitMinutes: v });
    prev = v;
  }
  return out;
}

// 過去の確定値を守って、新しい計算結果と合わせる（MVP_SPEC 4.4・Q4「今日から先を計算し直す。昨日以前は変えない」）。
//   firstMutableDate より前の日: 前の値をそのまま残す（新しい計算で変えない。前に値がなければ未設定のまま）
//   firstMutableDate 以降の日: 新しい計算で置き換える（新しい計算で未設定になった日は消える）
// 結果は日付順
export function mergeWithFinalized(
  existing: DailyLimit[],
  computed: DailyLimit[],
  firstMutableDate: string,
): DailyLimit[] {
  const byDate = new Map<string, DailyLimit>();
  for (const e of existing) if (e.date < firstMutableDate) byDate.set(e.date, e);
  for (const c of computed) {
    if (c.date >= firstMutableDate) byDate.set(c.date, c);
    else if (!byDate.has(c.date)) byDate.set(c.date, c);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
