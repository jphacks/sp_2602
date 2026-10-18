// 保護者のウィジェット（Figma 親08）に渡す値のテスト（src/components/parent/widget.ts）。
// 「初日から 40 分 減」「上限 300→260分」が親03 振り返りと同じ数字になること、数字を出せない日は 0 ではなく文になること、
// 先の日の分まで渡す（保護者が Slope を開かない日もウィジェットがその日の値を出せる）ことを確かめる。
import type { ConfigSnapshot, DailyLimit, PlanSettings, TestPeriod } from "@contracts/schemas";
import type { ConfigState } from "@/lib/config-cache";
import { describe, expect, it } from "vitest";
import { limitReduction } from "@/components/parent/review";
import {
  PARENT_WIDGET_DAYS,
  parentWidgetData,
  parentWidgetUpdate,
  reductionForWidget,
  unlinkedParentWidgetData,
} from "@/components/parent/widget";

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
  dailyLimits: [
    lim("2026-10-12", 300),
    lim("2026-10-13", 287),
    lim("2026-10-14", 273),
    lim("2026-10-15", 260),
    lim("2026-10-16", 250),
    { date: "2026-10-17", kind: "unlimited", blankPeriodId: "b1" },
  ],
  testPeriods: [test("2026-10-28", "2026-10-30")],
  ...over,
});

describe("reductionForWidget（振り返りの減り → ウィジェットの左）", () => {
  it("Figma 親08: 初日から 40 分 減・上限 300→260分（親03 と同じ数字）", () => {
    expect(reductionForWidget(limitReduction(snap(), today), today)).toEqual({
      kind: "ok",
      reducedMinutes: 40,
      fromLimit: 300,
      toLimit: 260,
    });
  });

  it("計画の初日は、親03 と同じく「0 分 減」ではなく初日の文", () => {
    const first = "2026-10-12";
    expect(reductionForWidget(limitReduction(snap(), first), first)).toEqual({
      kind: "message",
      title: "今日が計画の初日",
      body: "上限 300分 から始まります",
    });
  });

  it("数字を出せない日は 0 分減ではなく、それぞれの文にする", () => {
    expect(reductionForWidget({ kind: "no_plan" }, today)).toEqual({
      kind: "message",
      title: "計画がまだありません",
      body: "計画を決めると出ます",
    });
    expect(reductionForWidget({ kind: "not_started", startDate: "2026-10-20" }, today)).toEqual({
      kind: "message",
      title: "まだ始まっていません",
      body: "計画は 10/20 から",
    });
    expect(reductionForWidget({ kind: "unlimited_today", startDate: "2026-10-12" }, today)).toMatchObject({
      kind: "message",
      title: "今日は制限なし",
    });
    expect(reductionForWidget({ kind: "unknown", startDate: "2026-10-12" }, today)).toEqual({
      kind: "message",
      title: "まだ分かりません",
      body: "Slope を開くと出ます",
    });
  });
});

describe("parentWidgetData（端末に保存する値）", () => {
  it("今日から先の日ごとの減りを渡す（開かない日も、その日の値が出る）", () => {
    const d = parentWidgetData(snap(), today);
    expect(d.days).toHaveLength(PARENT_WIDGET_DAYS);
    expect(d.days[0]).toEqual({
      date: "2026-10-15",
      reduction: { kind: "ok", reducedMinutes: 40, fromLimit: 300, toLimit: 260 },
    });
    expect(d.days[1]).toEqual({
      date: "2026-10-16",
      reduction: { kind: "ok", reducedMinutes: 50, fromLimit: 300, toLimit: 250 },
    });
    // 空白期間の日は「制限なし」、日別上限が手元にない日は「まだ分かりません」（0 分減と出さない）
    expect(d.days[2]?.reduction).toMatchObject({ kind: "message", title: "今日は制限なし" });
    expect(d.days[3]?.reduction).toMatchObject({ kind: "message", title: "まだ分かりません" });
  });

  it("テストの日程は表示に要るものだけを渡す（次のテストはウィジェットが描くたびに選ぶ）", () => {
    expect(parentWidgetData(snap(), today).testPeriods).toEqual([
      { name: "数学", startDate: "2026-10-28", endDate: "2026-10-30" },
    ]);
  });

  it("計画がなければ、どの日も文（計画がまだありません）", () => {
    const d = parentWidgetData(snap({ plan: null }), today, 3);
    expect(d.days.map((x) => x.reduction.kind)).toEqual(["message", "message", "message"]);
  });
});

describe("子どもとつながっていない保護者のウィジェット（D-133）", () => {
  it("前の子どもの数字・テストを残さず、今日から先の毎日「つながっていません」の文にする", () => {
    const w = unlinkedParentWidgetData(today);
    expect(w.testPeriods).toEqual([]);
    expect(w.days).toHaveLength(PARENT_WIDGET_DAYS);
    expect(w.days[0]?.date).toBe(today);
    expect(w.days.at(-1)?.date).toBe("2026-11-14");
    for (const d of w.days)
      expect(d.reduction).toEqual({
        kind: "message",
        title: "つながっていません",
        body: "子どもと QR でつなぐと出ます",
      });
  });
});

describe("parentWidgetUpdate（保存するかと、その値。ParentWidgetSync が使う）", () => {
  const full = (childId: string): ConfigSnapshot => ({
    ...snap(),
    childId,
    configVersion: 3,
    calculationVersion: 3,
    usualLimitMinutes: 300,
    blankPeriods: [],
    excludedApps: [],
    blockedSites: [],
    generatedAt: "2026-10-15T00:00:00.000Z",
  });
  const fresh = (childId: string): ConfigState => ({ status: "fresh", snapshot: full(childId), savedAt: "x" });
  const a = { id: "child-a" };
  const b = { id: "child-b" };

  it("家族の一覧にいる子どもの設定なら、その値を保存する（一覧がまだ読めていない null のときも）", () => {
    expect(parentWidgetUpdate(fresh("child-a"), [a, b], today)).toEqual(parentWidgetData(full("child-a"), today));
    expect(parentWidgetUpdate(fresh("child-a"), null, today)).toEqual(parentWidgetData(full("child-a"), today));
  });

  it("家族の一覧が空なら「つながっていません」（設定が残っていても）", () => {
    expect(parentWidgetUpdate(fresh("child-a"), [], today)).toEqual(unlinkedParentWidgetData(today));
    expect(parentWidgetUpdate(null, [], today)).toEqual(unlinkedParentWidgetData(today));
  });

  it("外したあとに届いた前の子どもの設定（一覧にいない子ども）では保存しない（前の子どもの値で上書きしない）", () => {
    expect(parentWidgetUpdate(fresh("child-a"), [b], today)).toBeNull();
  });

  it("設定がない・取れない（unavailable）なら保存しない（0 分減と出さない）", () => {
    expect(parentWidgetUpdate(null, [a], today)).toBeNull();
    expect(parentWidgetUpdate({ status: "unavailable", error: null }, [a], today)).toBeNull();
  });
});
