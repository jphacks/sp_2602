// 親02 計画を作る の入力の検査のテスト（Q14: 開始日・S・G は必須、0〜1440、G ≤ S、開始日は今日以降）。
import type { PlanView } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import {
  type PlanForm,
  planAlreadyStarted,
  planFormFromView,
  reflectState,
  saveConfirmation,
  validatePlanForm,
} from "@/components/parent/plan-form";

const today = "2026-10-17";
const hm = (hours: string, minutes = "0") => ({ hours, minutes });
const form = (over: Partial<PlanForm> = {}): PlanForm => ({
  startDate: today,
  start: hm("5"),
  goal: hm("1"),
  usual: hm("3"),
  ...over,
});

describe("validatePlanForm", () => {
  it("Figma 親02 の見本（5時間・1時間・3時間）は分に直して通る", () => {
    expect(validatePlanForm(form(), today)).toEqual({
      ok: true,
      value: { planStartDate: today, startLimitMinutes: 300, finalGoalMinutes: 60, usualLimitMinutes: 180 },
    });
  });

  it("通常上限は任意。空なら送らない（今の値を保つ）", () => {
    const r = validatePlanForm(form({ usual: hm("", "") }), today);
    expect(r.ok && r.value).toEqual({ planStartDate: today, startLimitMinutes: 300, finalGoalMinutes: 60 });
  });

  it("開始日・S・G は必須", () => {
    const r = validatePlanForm(form({ startDate: null, start: hm("", ""), goal: hm("", "") }), today);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.startDate).toBe("計画の開始日を選んでください");
      expect(r.errors.start).toBe("開始上限を入れてください");
      expect(r.errors.goal).toBe("最終目標を入れてください");
      expect(r.errors.usual).toBeUndefined();
    }
  });

  it("開始日は今日以降（今日は可・昨日は不可）", () => {
    expect(validatePlanForm(form({ startDate: today }), today).ok).toBe(true);
    const r = validatePlanForm(form({ startDate: "2026-10-16" }), today);
    expect(!r.ok && r.errors.startDate).toBe("開始日は今日（10/17）以降にしてください");
  });

  it("G ≤ S（同じは可・G が大きいと最終目標の欄のエラー）", () => {
    expect(validatePlanForm(form({ start: hm("2"), goal: hm("2") }), today).ok).toBe(true);
    const r = validatePlanForm(form({ start: hm("1"), goal: hm("2") }), today);
    expect(!r.ok && r.errors.goal).toBe("最終目標は開始上限と同じか、それより短くしてください");
  });

  it("0 分は有効な上限（S = G = 0 も通る）", () => {
    const r = validatePlanForm(form({ start: hm("0"), goal: hm("0"), usual: hm("0") }), today);
    expect(r.ok && r.value).toMatchObject({ startLimitMinutes: 0, finalGoalMinutes: 0, usualLimitMinutes: 0 });
  });

  it("1440 分を超える・分が 60 以上・数字でないは、その欄のエラー", () => {
    const r = validatePlanForm(form({ start: hm("25"), goal: hm("1", "75"), usual: hm("x") }), today);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.start).toBe("24時間（1440分）までで入れてください");
      expect(r.errors.goal).toBe("分は 0〜59 で入れてください");
      expect(r.errors.usual).toBe("数字で入れてください");
    }
  });
});

const view = (over: Partial<PlanView> = {}): PlanView => ({
  childId: "c1",
  plan: null,
  usualLimitMinutes: null,
  configVersion: 3,
  childAppliedVersion: 3,
  ...over,
});
const plan = (planStartDate: string) => ({
  planStartDate,
  startLimitMinutes: 300,
  finalGoalMinutes: 120,
  childId: "c1",
  version: 2,
  updatedAt: "2026-10-01T00:00:00.000Z",
});

describe("planFormFromView（入力の初期値）", () => {
  it("計画がない: 開始日は今日、S・G は空、通常上限は今の値", () => {
    expect(planFormFromView(view({ usualLimitMinutes: 180 }), today)).toEqual({
      startDate: today,
      start: { hours: "", minutes: "" },
      goal: { hours: "", minutes: "" },
      usual: { hours: "3", minutes: "0" },
    });
  });
  it("始まっていない計画: 開始日をそのまま使う", () => {
    const f = planFormFromView(view({ plan: plan("2026-10-20") }), today);
    expect(f.startDate).toBe("2026-10-20");
    expect(f.start).toEqual({ hours: "5", minutes: "0" });
    expect(f.goal).toEqual({ hours: "2", minutes: "0" });
  });
  it("もう始まった計画: 開始日は今日にする（昨日以前では保存できないため）", () => {
    const v = view({ plan: plan("2026-10-03") });
    expect(planFormFromView(v, today).startDate).toBe(today);
    expect(planAlreadyStarted(v, today)).toBe(true);
    expect(planAlreadyStarted(view({ plan: plan(today) }), today)).toBe(false);
  });
  it("読み込めていない（null）ときも入力欄は作れる", () => {
    expect(planFormFromView(null, today).startDate).toBe(today);
  });
});

describe("保存の確定と反映（Q5・Q6）", () => {
  it("saveConfirmation: 画面の設定の組が保存した版まで追いついたら confirmed", () => {
    expect(saveConfirmation(5, 5)).toBe("confirmed");
    expect(saveConfirmation(5, 6)).toBe("confirmed");
    expect(saveConfirmation(5, 4)).toBe("loading");
    expect(saveConfirmation(5, null)).toBe("loading");
  });
  it("reflectState: 子どもの端末の版がその変更の版以上なら反映済み。まだ取りに来ていなければ反映待ち", () => {
    expect(reflectState(5, 5)).toBe("applied");
    expect(reflectState(6, 5)).toBe("applied");
    expect(reflectState(4, 5)).toBe("pending");
    expect(reflectState(null, 0)).toBe("pending");
  });
});
