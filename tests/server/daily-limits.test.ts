// C10 の日別上限の計算のテスト（MVP_SPEC 4.4・AC-06・AC-07、Q7 の空白期間）。期待値は式から手で計算した値。
// 例の計画: 計画開始日 10/01・開始上限 S=240・最終目標 G=60。最後のテストが 10/21 開始なので D=20 日。
import type { DailyLimit } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { computeDailyLimits, type LimitInputs, mergeWithFinalized, PlanCalcError } from "@/server/plan/daily-limits";

const plan = { planStartDate: "2026-10-01", startLimitMinutes: 240, finalGoalMinutes: 60 };
const inputs = (over: Partial<LimitInputs> = {}): LimitInputs => ({
  usualLimitMinutes: 180,
  plan,
  testPeriods: [],
  blankPeriods: [],
  ...over,
});
// 1日の値（limited なら分、unlimited なら "unlimited"、なければ undefined = 未設定）
const limitOn = (limits: DailyLimit[], date: string) => {
  const l = limits.find((x) => x.date === date);
  return l == null ? undefined : l.kind === "limited" ? l.limitMinutes : "unlimited";
};

const midTest = { startDate: "2026-10-11", endDate: "2026-10-13" };
const finalTest = { startDate: "2026-10-21", endDate: "2026-10-23" };

describe("C10: 日別上限", () => {
  it("テスト期間が0件なら、すべての日が通常上限（未設定ではない）", () => {
    const out = computeDailyLimits(inputs(), "2026-10-01", "2026-10-07");
    expect(out).toHaveLength(7);
    expect(out.every((l) => l.kind === "limited" && l.limitMinutes === 180)).toBe(true);
  });

  it("計画も通常上限もないなら、どの日も上限未設定（一覧に入らない）", () => {
    expect(computeDailyLimits(inputs({ usualLimitMinutes: null, plan: null }), "2026-10-01", "2026-10-07")).toEqual([]);
  });

  it("計画がなく通常上限だけなら、その値（紐づけ直後に決めた上限。Q7）", () => {
    const out = computeDailyLimits(inputs({ plan: null, usualLimitMinutes: 90 }), "2026-10-01", "2026-10-02");
    expect(out.map((l) => limitOn([l], l.date))).toEqual([90, 90]);
  });

  it("通常の減少: 基準曲線 B(d) = S − (S − G)u² に沿って下がり、最後のテストの開始日に G になる", () => {
    const out = computeDailyLimits(inputs({ testPeriods: [finalTest] }), "2026-10-01", "2026-10-21");
    expect(limitOn(out, "2026-10-01")).toBe(240); // u = 0
    expect(limitOn(out, "2026-10-06")).toBe(228); // u = 0.25 → 228.75 を切り捨て
    expect(limitOn(out, "2026-10-11")).toBe(195); // u = 0.5 → 195
    expect(limitOn(out, "2026-10-21")).toBe(60); // u = 1 → G
    const values = out.map((l) => (l.kind === "limited" ? l.limitMinutes : 0));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThanOrEqual(values[i - 1] as number);
  });

  it("途中のテストの間は Q を維持し、終わった翌日に回復して、次のテストの目標まで線形に下がる", () => {
    const out = computeDailyLimits(inputs({ testPeriods: [midTest, finalTest] }), "2026-10-01", "2026-10-21");
    expect(limitOn(out, "2026-10-10")).toBe(203); // B = 203.55 を切り捨て
    // テスト中は Q₁ = B(10/11) = 195 のまま
    expect([limitOn(out, "2026-10-11"), limitOn(out, "2026-10-12"), limitOn(out, "2026-10-13")]).toEqual([
      195, 195, 195,
    ]);
    // u_end = 0.6 → r = 0.8 × (1 − 0.36) = 0.512、R = 195 + 0.512 × (240 − 195) = 218.04
    expect(limitOn(out, "2026-10-14")).toBe(218);
    // 10/14 の R から 10/21 の G=60 まで 7 日で線形: 1日 −22.577
    expect(limitOn(out, "2026-10-15")).toBe(195); // 195.46
    expect(limitOn(out, "2026-10-20")).toBe(82); // 82.58 を切り捨て
    expect(limitOn(out, "2026-10-21")).toBe(60);
  });

  it("連続したテスト（終了の翌日が次の開始日）では回復しない", () => {
    const back = { startDate: "2026-10-14", endDate: "2026-10-15" };
    const out = computeDailyLimits(inputs({ testPeriods: [midTest, back, finalTest] }), "2026-10-11", "2026-10-21");
    expect(limitOn(out, "2026-10-13")).toBe(195);
    // 回復せず、すぐ次のテストの Q₂ = B(10/14)（u = 0.65 → 163.95）
    expect(limitOn(out, "2026-10-14")).toBe(163);
    expect(limitOn(out, "2026-10-15")).toBe(163);
    // 2つ目のテストの後は回復する（ピーク P は前のまま S=240。u_end = 0.7 → r = 0.408 → R = 194.98）
    expect(limitOn(out, "2026-10-16")).toBe(194); // 194.98 を切り捨て
  });

  it("金曜から月曜のテストは連続扱いとし、週末の間も直前の上限を維持する", () => {
    const fridayTest = { startDate: "2026-10-09", endDate: "2026-10-09" };
    const mondayTest = { startDate: "2026-10-12", endDate: "2026-10-12" };
    const duplicatedSameDay = { ...fridayTest };
    const out = computeDailyLimits(
      inputs({ testPeriods: [fridayTest, duplicatedSameDay, mondayTest, finalTest] }),
      "2026-10-09",
      "2026-10-12",
    );
    expect(limitOn(out, "2026-10-10")).toBe(limitOn(out, "2026-10-09"));
    expect(limitOn(out, "2026-10-11")).toBe(limitOn(out, "2026-10-09"));
    expect(limitOn(out, "2026-10-12")).toBe(185); // 月曜のテスト目標は B(10/12)=185.55→185
  });

  it("最終テスト期間中は G を維持し、終了翌日から通常上限に戻る", () => {
    const out = computeDailyLimits(inputs({ testPeriods: [midTest, finalTest] }), "2026-10-21", "2026-10-26");
    expect(out.map((l) => limitOn([l], l.date))).toEqual([60, 60, 60, 180, 180, 180]);
  });

  it("通常上限が G 以下でも終了翌日から通常上限をそのまま適用する", () => {
    const out = computeDailyLimits(
      inputs({ usualLimitMinutes: 40, testPeriods: [finalTest] }),
      "2026-10-21",
      "2026-10-24",
    );
    expect(out.map((l) => limitOn([l], l.date))).toEqual([60, 60, 60, 40]);
  });

  it("計画開始日より前の日は通常上限（TODO(未決) の既定。引数で S にもできる）", () => {
    const out = computeDailyLimits(inputs({ testPeriods: [finalTest] }), "2026-09-30", "2026-09-30");
    expect(limitOn(out, "2026-09-30")).toBe(180);
    const s = computeDailyLimits(inputs({ testPeriods: [finalTest] }), "2026-09-30", "2026-09-30", {
      beforePlanStart: "start",
    });
    expect(limitOn(s, "2026-09-30")).toBe(240);
  });

  it("空白期間の日は「制限なし」。終わった日からは元の上限に戻る（Q7）", () => {
    const blank = { id: "b1", startDate: "2026-10-05", endDate: "2026-10-07" };
    const base = computeDailyLimits(inputs({ testPeriods: [finalTest] }), "2026-10-01", "2026-10-10");
    const out = computeDailyLimits(
      inputs({ testPeriods: [finalTest], blankPeriods: [blank] }),
      "2026-10-01",
      "2026-10-10",
    );
    expect(out.find((l) => l.date === "2026-10-06")).toEqual({
      date: "2026-10-06",
      kind: "unlimited",
      blankPeriodId: "b1",
    });
    expect(limitOn(out, "2026-10-04")).toBe(limitOn(base, "2026-10-04"));
    expect(limitOn(out, "2026-10-08")).toBe(limitOn(base, "2026-10-08"));
  });

  it("空白期間は通常上限が未設定でも「制限なし」として入る（未設定とは別の状態）", () => {
    const out = computeDailyLimits(
      inputs({
        plan: null,
        usualLimitMinutes: null,
        blankPeriods: [{ id: "b", startDate: "2026-10-02", endDate: "2026-10-02" }],
      }),
      "2026-10-01",
      "2026-10-03",
    );
    expect(out).toEqual([{ date: "2026-10-02", kind: "unlimited", blankPeriodId: "b" }]);
  });

  it("重なるテスト期間・空白期間は計算できない入力（PlanCalcError）", () => {
    const overlap = { startDate: "2026-10-12", endDate: "2026-10-14" };
    expect(() =>
      computeDailyLimits(inputs({ testPeriods: [midTest, overlap, finalTest] }), "2026-10-01", "2026-10-02"),
    ).toThrow(PlanCalcError);
    const blanks = [
      { id: "a", startDate: "2026-10-01", endDate: "2026-10-05" },
      { id: "b", startDate: "2026-10-05", endDate: "2026-10-06" },
    ];
    expect(() => computeDailyLimits(inputs({ blankPeriods: blanks }), "2026-10-01", "2026-10-02")).toThrow(
      PlanCalcError,
    );
  });

  it("D=0（計画開始日に最終テスト開始）は S/G に関係なく G を期間中に適用する", () => {
    const t = { startDate: "2026-10-01", endDate: "2026-10-02" };
    const different = computeDailyLimits(inputs({ testPeriods: [t] }), "2026-10-01", "2026-10-03");
    expect(different.map((l) => limitOn([l], l.date))).toEqual([60, 60, 180]);
    const same = computeDailyLimits(
      inputs({ plan: { ...plan, finalGoalMinutes: 240 }, testPeriods: [t] }),
      "2026-10-01",
      "2026-10-03",
    );
    expect(same.map((l) => limitOn([l], l.date))).toEqual([240, 240, 180]);
  });

  it("最後のテスト開始日が計画開始日より前ならエラーにする", () => {
    const earlyTest = { startDate: "2026-09-30", endDate: "2026-09-30" };
    expect(() => computeDailyLimits(inputs({ testPeriods: [earlyTest] }), "2026-10-01", "2026-10-02")).toThrow(
      PlanCalcError,
    );
  });

  it("丸め方と1日の最大の減少幅は引数で変えられる（TODO(未決)）", () => {
    const floor = computeDailyLimits(inputs({ testPeriods: [finalTest] }), "2026-10-06", "2026-10-06", {
      rounding: "floor",
    });
    expect(limitOn(floor, "2026-10-06")).toBe(228);
    const capped = computeDailyLimits(inputs({ testPeriods: [midTest, finalTest] }), "2026-10-20", "2026-10-21", {
      maxDailyDecrease: 10,
    });
    expect(limitOn(capped, "2026-10-21")).toBe(72); // 82 から 10 分までしか下げない
  });

  it("再計算で昨日以前の確定値は変えない（mergeWithFinalized。AC-07）", () => {
    const existing: DailyLimit[] = [
      { date: "2026-10-13", kind: "limited", limitMinutes: 100 },
      { date: "2026-10-14", kind: "limited", limitMinutes: 100 },
      { date: "2026-10-15", kind: "limited", limitMinutes: 100 },
    ];
    const computed = computeDailyLimits(inputs({ usualLimitMinutes: 50, plan: null }), "2026-10-14", "2026-10-16");
    const merged = mergeWithFinalized(existing, computed, "2026-10-15");
    expect(merged.map((l) => limitOn([l], l.date))).toEqual([100, 100, 50, 50]);
    expect(merged.map((l) => l.date)).toEqual(["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
  });

  it("同じ入力なら必ず同じ結果（純粋な関数）", () => {
    const a = computeDailyLimits(inputs({ testPeriods: [midTest, finalTest] }), "2026-10-01", "2026-11-01");
    const b = computeDailyLimits(inputs({ testPeriods: [finalTest, midTest] }), "2026-10-01", "2026-11-01");
    expect(a).toEqual(b);
  });
});
