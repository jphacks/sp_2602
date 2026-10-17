// 子02 使用割合の動きの順番のテスト（src/components/child/usage-timeline.ts・src/components/chart-motion.ts）。
// ゲージ → 札 → 棒グラフ の順に出ること、今日の棒が最後に伸びること、全体が長すぎないこと、
// 値のない日も位置は数えること、遅れて届いた棒を待たせないことを確かめる。
// motion.ts は React Native を読むので Node では読めない。同じ値をここに写す（変えたらここも直す）
import { describe, expect, it } from "vitest";
import { barDelays, remainingDelay } from "@/components/chart-motion";
import { usageTimeline } from "@/components/child/usage-timeline";

const MOTION = { short: 200, medium: 400, fill: 900, stagger: 60 };
const STAGGER = { stagger: MOTION.stagger, emphasisGap: MOTION.stagger };
const BAR_GROW = MOTION.medium; // BarChart の棒が伸びる時間

// 今日が i 番目（0 = 月曜）の週。今日より後の日は値なし（BarChart は伸ばさない）
const week = (todayIndex: number) =>
  Array.from({ length: 7 }, (_, i) => ({ highlight: i === todayIndex, value: i <= todayIndex ? 50 : null }));

// 値のある棒のうち、いちばん遅く伸び終わる時刻
const lastBarEnd = (todayIndex: number) => {
  const t = usageTimeline(MOTION);
  const bars = week(todayIndex);
  const delays = barDelays(bars, STAGGER);
  return Math.max(...bars.flatMap((b, i) => (b.value == null ? [] : [t.bars + (delays[i] ?? 0) + BAR_GROW])));
};

describe("子02 の出る順番", () => {
  const t = usageTimeline(MOTION);

  it("ゲージ → 札 → 棒 の順に始まる", () => {
    expect(t.gauge).toBeGreaterThanOrEqual(0);
    expect(t.chip).toBeGreaterThan(t.gauge);
    expect(t.bars).toBeGreaterThan(t.chip);
  });

  it("札はゲージが伸び終わるころ（伸びる時間の後半）に出る", () => {
    expect(t.chip - t.gauge).toBeGreaterThanOrEqual(MOTION.fill / 2);
    expect(t.chip).toBeLessThan(t.gauge + MOTION.fill);
  });

  it("全体で 1.6 秒以内（今日が日曜で棒が7本伸びるときでも）", () => {
    for (let i = 0; i < 7; i++) expect(lastBarEnd(i)).toBeLessThanOrEqual(1600);
    // 木曜（Figma 子02 の 10/15）は 1.5 秒以内
    expect(lastBarEnd(3)).toBeLessThanOrEqual(1500);
  });

  it("ゲージがないとき（文を出しているとき）は、棒を待たせない", () => {
    expect(t.barsAlone).toBeLessThan(t.bars);
    expect(t.barsAlone).toBeLessThanOrEqual(MOTION.short);
  });
});

describe("棒ごとの待ち時間（barDelays）", () => {
  it("左から順に stagger ずつ遅れる", () => {
    expect(
      barDelays(
        week(6).map(() => ({ highlight: false })),
        STAGGER,
      ),
    ).toEqual([0, 60, 120, 180, 240, 300, 360]);
  });

  it("今日は一拍おいて、値のある棒の中で最後に伸びる", () => {
    for (let today = 0; today < 7; today++) {
      const bars = week(today);
      const d = barDelays(bars, STAGGER);
      const others = bars.flatMap((b, i) => (b.value != null && !b.highlight ? [d[i] ?? 0] : []));
      expect(d[today]).toBeGreaterThan(Math.max(-1, ...others));
      expect(d[today]).toBe(today * MOTION.stagger + MOTION.stagger);
    }
  });

  it("値のない日（記録なし）も位置は数える（後ろの棒の順番がずれない）", () => {
    const bars = [{}, {}, {}, { highlight: true }];
    expect(barDelays(bars, STAGGER)).toEqual([0, 60, 120, 240]);
  });
});

describe("遅れて値が届いた棒（remainingDelay）", () => {
  it("予定より前に届いたら、残りだけ待つ", () => {
    expect(remainingDelay(760, 50)).toBe(710);
  });

  it("予定を過ぎて届いたら、待たずにすぐ伸ばす（負の待ちにしない）", () => {
    expect(remainingDelay(760, 2000)).toBe(0);
  });

  it("時計が戻っても（経過が負）、予定より長くは待たせない", () => {
    expect(remainingDelay(760, -100)).toBe(760);
  });
});
