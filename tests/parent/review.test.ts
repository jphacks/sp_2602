// 親03 振り返り の中身のテスト（src/components/parent/review.ts）。
// 「減った」の基準は未決（Q19）。仮の基準「計画の初日の上限 → 今日の上限」で Figma の 40 分・13% になることを確かめる。
import type { ConfigSnapshot, DailyLimit, PlanSettings, TestPeriod } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { afterTestNote, limitReduction, previousTest, reviewPeriod } from "@/components/parent/review";

const today = "2026-10-15";
const plan = (over: Partial<PlanSettings> = {}): PlanSettings => ({
  planStartDate: "2026-10-12",
  startLimitMinutes: 300,
  finalGoalMinutes: 100,
  childId: "c1",
  version: 2,
  updatedAt: "2026-10-12T00:00:00.000Z",
  ...over,
});
const lim = (date: string, limitMinutes: number): DailyLimit => ({ date, kind: "limited", limitMinutes });
const test = (startDate: string, endDate: string, name = "数学"): TestPeriod => ({
  id: `t-${startDate}`,
  name,
  startDate,
  endDate,
  createdByUserId: "p",
  createdByRole: "parent",
});
type Snap = Pick<ConfigSnapshot, "plan" | "dailyLimits" | "testPeriods">;
const snap = (over: Partial<Snap> = {}): Snap => ({
  plan: plan(),
  dailyLimits: [lim("2026-10-12", 300), lim("2026-10-13", 287), lim("2026-10-14", 273), lim("2026-10-15", 260)],
  testPeriods: [],
  ...over,
});

describe("limitReduction（初日から今日までに上限が何分減ったか。TODO(未決) Q19）", () => {
  it("Figma 親03: 300 → 260 で 40 分・13% 減", () => {
    expect(limitReduction(snap(), today)).toEqual({
      kind: "ok",
      startDate: "2026-10-12",
      startLimit: 300,
      todayLimit: 260,
      reducedMinutes: 40,
      percent: 13,
    });
  });

  it("計画がない・まだ始まっていないは、それぞれ別の状態", () => {
    expect(limitReduction(snap({ plan: null }), today)).toEqual({ kind: "no_plan" });
    expect(limitReduction(snap({ plan: plan({ planStartDate: "2026-10-20" }) }), today)).toEqual({
      kind: "not_started",
      startDate: "2026-10-20",
    });
  });

  it("今日が空白期間（制限なし）・今日の上限がないときは比べない（0 分減と出さない）", () => {
    const unlimited = snap({
      dailyLimits: [lim("2026-10-12", 300), { date: today, kind: "unlimited", blankPeriodId: "b" }],
    });
    expect(limitReduction(unlimited, today).kind).toBe("unlimited_today");
    expect(limitReduction(snap({ dailyLimits: [lim("2026-10-12", 300)] }), today).kind).toBe("unknown");
  });

  it("初日の値が残っていなければ、開始上限 S を初日の上限とみなす（C10 で初日は S）", () => {
    const r = limitReduction(snap({ dailyLimits: [lim(today, 240)] }), today);
    expect(r).toMatchObject({ kind: "ok", startLimit: 300, reducedMinutes: 60, percent: 20 });
  });

  it("初日の上限が 0 分なら割合は出さない（0 で割らない）", () => {
    const r = limitReduction(
      snap({
        plan: plan({ startLimitMinutes: 0, finalGoalMinutes: 0 }),
        dailyLimits: [lim("2026-10-12", 0), lim(today, 0)],
      }),
      today,
    );
    expect(r).toMatchObject({ kind: "ok", reducedMinutes: 0, percent: null });
  });
});

describe("reviewPeriod（期間の帯）", () => {
  const prev = test("2026-09-24", "2026-09-26", "中間");
  const next = test("2026-10-28", "2026-10-30");

  it("Figma 親03: 前の試験 9/24 〜 今の試験 10/28", () => {
    expect(reviewPeriod(snap({ testPeriods: [prev, next] }), today)).toBe("前の試験 9/24 〜 今の試験 10/28");
  });
  it("前の試験がなければ計画の開始日、今の試験がなければ今日", () => {
    expect(reviewPeriod(snap({ testPeriods: [next] }), today)).toBe("計画の開始 10/12 〜 今の試験 10/28");
    expect(reviewPeriod(snap({ testPeriods: [prev] }), today)).toBe("前の試験 9/24 〜 今日 10/15");
    expect(reviewPeriod(snap({ plan: null, testPeriods: [next] }), today)).toBe("今の試験 10/28");
  });
  it("前の試験は、今日より前に終わったテストのうち一番新しいもの（期間中のテストは前の試験ではない）", () => {
    const older = test("2026-09-01", "2026-09-02");
    const ongoing = test("2026-10-14", "2026-10-16");
    expect(previousTest([older, ongoing, prev], today)?.startDate).toBe("2026-09-24");
  });
});

describe("afterTestNote（テストのあとの上限のお知らせ）", () => {
  it("あとにテストが残っていれば「一度少し戻ります」（C10 の回復）", () => {
    const s = snap({ testPeriods: [test("2026-10-28", "2026-10-30"), test("2026-12-01", "2026-12-03")] });
    expect(afterTestNote(s, today)).toBe("テスト（10/28）が終わると、上限は一度少し戻ります。");
  });
  it("最後のテストなら、最終目標のまま（C10: 最後のテストのあとは G を保つ）", () => {
    const s = snap({ testPeriods: [test("2026-10-28", "2026-10-30")] });
    expect(afterTestNote(s, today)).toBe(
      "テスト（10/28）が最後のテストです。終わったあとも、上限は最終目標の 100分 のままです。",
    );
  });
  it("計画がない・次のテストがないときは出さない", () => {
    expect(afterTestNote(snap({ plan: null, testPeriods: [test("2026-10-28", "2026-10-30")] }), today)).toBeNull();
    expect(afterTestNote(snap(), today)).toBeNull();
  });
});
