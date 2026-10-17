// 保護者の画面の棒グラフのデータ作りのテスト（src/components/parent/charts.ts）。
// 記録なし・0 分・未来の日・制限なし・上限未設定を取り違えないこと（C6・Q7）、C10 を計算し直さずサーバの値を拾うこと。
import { addDays, datesInRange } from "@contracts/dates";
import type { DailyLimit, DayLimit, TestPeriod, UsageDay } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import {
  chartNotes,
  homeWeekBars,
  planTrendBars,
  reviewRange,
  reviewWeekBars,
  weekAverages,
} from "@/components/parent/charts";

const limited = (limitMinutes: number): DayLimit => ({ kind: "limited", limitMinutes });
const day = (date: string, used: number | null, limit: DayLimit | null): UsageDay => ({
  date,
  recorded: used != null,
  usedMinutes: used,
  measuredAt: used != null ? `${date}T03:00:00.000Z` : null,
  limit,
  apps: [],
});
const test = (startDate: string, endDate: string, name = "数学"): TestPeriod => ({
  id: `t-${startDate}`,
  name,
  startDate,
  endDate,
  createdByUserId: "p",
  createdByRole: "parent",
});

describe("homeWeekBars（親01 今週の使用時間）", () => {
  const today = "2026-10-15"; // 木曜
  const bars = homeWeekBars(
    [
      day("2026-10-12", 200, limited(300)),
      day("2026-10-13", null, limited(287)), // 記録なし
      day("2026-10-14", 0, { kind: "unlimited", blankPeriodId: "b1" }), // 0 分の記録・制限なし
      day("2026-10-15", 120, limited(260)), // 今日
      day("2026-10-16", null, limited(247)), // 未来
      day("2026-10-17", null, null), // 未来・上限未設定
      // 10/18 は応答にない
    ],
    today,
  );

  it("月〜日の7本で、曜日と日付が付く", () => {
    expect(bars.map((b) => `${b.label}${b.sublabel}`)).toEqual([
      "月10/12",
      "火10/13",
      "水10/14",
      "木10/15",
      "金10/16",
      "土10/17",
      "日10/18",
    ]);
  });

  it("過去は淡い色、今日は青・強調。棒の上は上限", () => {
    expect(bars[0]).toMatchObject({ topLabel: "300", track: 300, value: 200, fill: "muted", emphasis: false });
    expect(bars[3]).toMatchObject({ topLabel: "260", track: 260, value: 120, fill: "strong", emphasis: true });
  });

  it("記録なしは中身を描かず「？」、0 分の記録は高さ 0 で「？」なし", () => {
    expect(bars[1]).toMatchObject({ value: null, missing: true });
    expect(bars[2]).toMatchObject({ value: 0, missing: false });
  });

  it("制限なしは下地なしで「なし」、上限未設定は「－」。未来の日は中身なし・「？」なし", () => {
    expect(bars[2]).toMatchObject({ track: null, topLabel: "なし" });
    expect(bars[4]).toMatchObject({ value: null, missing: false, topLabel: "247" });
    expect(bars[5]).toMatchObject({ track: null, topLabel: "－" });
    expect(bars[6]).toMatchObject({ track: null, topLabel: "－", value: null, missing: false });
  });

  it("注記は使われた印のぶんだけ", () => {
    expect(chartNotes(bars)).toEqual([
      "？：記録がまだ届いていない日",
      "なし：制限なし（空白期間）",
      "－：上限が決まっていない・記録がない",
    ]);
    expect(chartNotes(bars.slice(0, 1))).toEqual([]);
  });
});

describe("weekAverages", () => {
  it("使った時間は今日までの記録がある日だけで平均（記録なしを 0 分として混ぜない）", () => {
    const a = weekAverages(
      [
        day("2026-10-12", 100, limited(300)),
        day("2026-10-13", null, limited(200)),
        day("2026-10-16", 999, limited(100)),
      ],
      "2026-10-15",
    );
    expect(a).toEqual({ used: 100, limit: 200, unlimited: false });
  });
  it("記録が1日もなければ null。上限ありの日がなく制限なしの日があれば unlimited", () => {
    expect(weekAverages([day("2026-10-12", null, { kind: "unlimited", blankPeriodId: "b" })], "2026-10-15")).toEqual({
      used: null,
      limit: null,
      unlimited: true,
    });
  });
});

describe("reviewWeekBars（親03 週ごとの1日の使用時間）", () => {
  const today = "2026-10-15";
  it("期間は今週の前3週〜後2週（月曜はじまり）", () => {
    expect(reviewRange(today)).toEqual({ from: "2026-09-21", to: "2026-11-01" });
  });

  const week = (monday: string, used: number | null, limits: number[] | number) =>
    datesInRange(monday, addDays(monday, 6)).map((d, i) =>
      day(d, d <= today ? used : null, limited(Array.isArray(limits) ? (limits[i] ?? 0) : limits)),
    );
  const days = [
    ...week("2026-09-21", 250, 180),
    ...week("2026-09-28", 290, 180),
    ...week("2026-10-05", null, 180), // 記録なしの週
    ...week("2026-10-12", 100, [300, 287, 273, 260, 247, 233, 220]),
    ...week("2026-10-19", null, 167),
    ...week("2026-10-26", null, 100),
  ];
  const bars = reviewWeekBars(days, today, {
    planStartDate: "2026-10-12",
    prevTestStart: "2026-09-24",
    nextTestStart: "2026-10-28",
  });

  it("6本で、下は週の月曜の日付（Figma 9/21・9/28・10/5・10/12・10/19・10/26）", () => {
    expect(bars.map((b) => b.label)).toEqual(["9/21", "9/28", "10/5", "10/12", "10/19", "10/26"]);
  });

  it("計画の前の週は淡い色・下地なし・上は使った時間の平均", () => {
    expect(bars[0]).toMatchObject({ topLabel: "250", track: null, value: 250, fill: "muted" });
    expect(bars[0]?.tags).toEqual([{ label: "前の試験", tone: "soft" }]);
  });

  it("記録のない週は「？」と「－」（0 分にしない）", () => {
    expect(bars[2]).toMatchObject({ value: null, missing: true, topLabel: "－" });
  });

  it("今週は青・強調・上は上限の平均（Figma 260）・札「今週」", () => {
    expect(bars[3]).toMatchObject({ topLabel: "260", track: 260, value: 100, fill: "strong", emphasis: true });
    expect(bars[3]?.tags).toEqual([{ label: "今週", tone: "strong" }]);
  });

  it("これからの週は上限だけ（Figma 167・100）。今の試験の週に札", () => {
    expect(bars[4]).toMatchObject({ topLabel: "167", track: 167, value: null, missing: false });
    expect(bars[5]).toMatchObject({ topLabel: "100", tags: [{ label: "今の試験", tone: "soft" }] });
  });

  it("計画がなければ、すべて計画の前として淡い色", () => {
    const noPlan = reviewWeekBars(days, today, { planStartDate: null, prevTestStart: null, nextTestStart: null });
    expect(noPlan.every((b) => b.fill === "muted" && b.track === null)).toBe(true);
  });
});

describe("planTrendBars（親02 今の計画での上限の下がり方）", () => {
  const today = "2026-10-17";
  // サーバの日別上限（C10 の結果）の見本: 1日 5 分ずつ下がる
  const dailyLimits: DailyLimit[] = datesInRange(today, "2026-11-30").map((date, i) => ({
    date,
    kind: "limited",
    limitMinutes: 300 - i * 5,
  }));

  it("今日〜最後のテストの開始日までを6本に間引く。値はサーバの日別上限をそのまま拾う", () => {
    const bars = planTrendBars({ dailyLimits, testPeriods: [test("2026-10-28", "2026-10-30")] }, today);
    expect(bars.map((b) => b.sublabel)).toEqual(["10/17", "10/19", "10/21", "10/24", "10/26", "10/28"]);
    expect(bars.map((b) => b.track)).toEqual([300, 290, 280, 265, 255, 245]);
    expect(bars.every((b) => b.value === b.track)).toBe(true);
    expect(bars[0]?.tags).toEqual([{ label: "今日", tone: "strong" }]);
    expect(bars[5]?.tags).toEqual([{ label: "テスト", tone: "soft" }]);
  });

  it("テストがなければ4週間ぶん。日別上限がある日までに収める", () => {
    const short = dailyLimits.slice(0, 10); // 10/17〜10/26
    const bars = planTrendBars({ dailyLimits: short, testPeriods: [] }, today);
    expect(bars.at(-1)?.sublabel).toBe("10/26");
    expect(bars).toHaveLength(6);
  });

  it("日別上限がない日は「－」、制限なしの日は「なし」", () => {
    const bars = planTrendBars(
      {
        dailyLimits: [
          { date: today, kind: "unlimited", blankPeriodId: "b" },
          { date: "2026-10-18", kind: "limited", limitMinutes: 200 },
        ],
        testPeriods: [test("2026-10-19", "2026-10-19")],
      },
      today,
    );
    expect(bars.map((b) => b.topLabel)).toEqual(["なし", "200"]);
  });

  it("日別上限が1日もなくても今日の1本（「－」）で壊れない", () => {
    expect(planTrendBars({ dailyLimits: [], testPeriods: [] }, today).map((b) => b.topLabel)).toEqual(["－"]);
  });
});
