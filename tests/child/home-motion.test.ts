// 子01 ホームの動きの決め方のテスト。
//   - 「次のテスト」のカードを光らせるか（src/components/child/child-view.ts の nextTestEmphasis）
//   - 帯・カードの出方と待ち時間（src/components/reveal-timing.ts の planReveal・leadDelay）
// 動きそのもの（Animated）は Node では動かせないので、いつ・どう出すかの判断だけを確かめる。
import type { ConfigSnapshot } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { NEXT_TEST_SOON_DAYS, nextTestEmphasis } from "@/components/child/child-view";
import { leadDelay, planReveal } from "@/components/reveal-timing";
import { nextTest } from "@/lib/usage-calc";

const TODAY = "2026-10-15";

const snapshot = (testPeriods: ConfigSnapshot["testPeriods"]): ConfigSnapshot => ({
  childId: "demo-child",
  configVersion: 3,
  calculationVersion: 1,
  usualLimitMinutes: 120,
  plan: null,
  testPeriods,
  blankPeriods: [],
  dailyLimits: [],
  excludedApps: [],
  blockedSites: [],
  generatedAt: "2026-10-15T00:00:00.000Z",
});
const period = (startDate: string, endDate = startDate) => ({
  id: "t1",
  name: "数学",
  startDate,
  endDate,
  createdByUserId: "u1",
  createdByRole: "child" as const,
});
const testOn = (startDate: string, endDate?: string) => nextTest(snapshot([period(startDate, endDate)]), TODAY);

describe("「次のテスト」のカードを光らせるか", () => {
  it("3日以内なら光らせる（ちょうど3日も含む）", () => {
    expect(NEXT_TEST_SOON_DAYS).toBe(3);
    expect(nextTestEmphasis(testOn("2026-10-16"))).toBe(true); // あと1日
    expect(nextTestEmphasis(testOn("2026-10-18"))).toBe(true); // あと3日
  });

  it("4日以上先なら光らせない", () => {
    expect(nextTestEmphasis(testOn("2026-10-19"))).toBe(false); // あと4日
    expect(nextTestEmphasis(testOn("2026-10-28"))).toBe(false); // あと13日（Figma の例）
  });

  it("テスト期間中（今日が初日・途中）は光らせる", () => {
    expect(nextTestEmphasis(testOn(TODAY))).toBe(true);
    expect(nextTestEmphasis(testOn("2026-10-14", "2026-10-16"))).toBe(true);
  });

  it("テストがない・設定が取れていないときは光らせない（分からないものを強調しない）", () => {
    expect(nextTestEmphasis(null)).toBe(false);
    expect(nextTestEmphasis(nextTest(snapshot([]), TODAY))).toBe(false);
    expect(nextTestEmphasis(nextTest(null, TODAY))).toBe(false);
    // 終わったテストは次のテストにならない
    expect(nextTestEmphasis(testOn("2026-10-10", "2026-10-14"))).toBe(false);
  });
});

describe("帯・カードの出方", () => {
  const base = { groupStartedAt: 1_000, stagger: 80, window: 400 };

  it("画面を開いたときに出たものは、上から順に stagger ずつ遅らせて出す", () => {
    expect(planReveal({ ...base, now: 1_000, index: 0 })).toEqual({ mode: "entrance", delay: 0 });
    expect(planReveal({ ...base, now: 1_000, index: 1 })).toEqual({ mode: "entrance", delay: 80 });
    expect(planReveal({ ...base, now: 1_000, index: 3 })).toEqual({ mode: "entrance", delay: 240 });
  });

  it("少し遅れて出たもの（権限が読めた直後など）は、予定の時刻に合わせる。過ぎていたら待たせない", () => {
    expect(planReveal({ ...base, now: 1_050, index: 2 })).toEqual({ mode: "entrance", delay: 110 });
    expect(planReveal({ ...base, now: 1_300, index: 2 })).toEqual({ mode: "entrance", delay: 0 });
  });

  it("画面を開いてしばらくしてから出たもの（通信のあとの帯）は、高さを広げて入れる", () => {
    expect(planReveal({ ...base, now: 1_400, index: 0 })).toEqual({ mode: "expand" });
    expect(planReveal({ ...base, now: 31_000, index: 0 })).toEqual({ mode: "expand" });
  });

  it("負の番号は 0 として扱う", () => {
    expect(planReveal({ ...base, now: 1_000, index: -1 })).toEqual({ mode: "entrance", delay: 0 });
  });
});

describe("中の動きを始めるまでの待ち時間", () => {
  it("カードが見え始めてから lead 後に始める", () => {
    expect(leadDelay(2_000, 1_000, 200)).toBe(1_200); // カードはまだ出ていない
    expect(leadDelay(1_000, 1_000, 200)).toBe(200);
  });

  it("もう過ぎていたら待たない（値が後から分かったとき）", () => {
    expect(leadDelay(1_000, 5_000, 200)).toBe(0);
  });

  it("Reveal の外（見え始める時刻が分からない）では待たない", () => {
    expect(leadDelay(null, 1_000, 200)).toBe(0);
  });
});
