// C4: Kotlin に渡す判定の値（toNativeRestriction。src/lib/usage-calc.ts）と、子01 の「見守りのための許可」（permissionGuide。
// src/components/child/child-view.ts）のテスト。
// 確かめること: 上限 0 分・制限なし・未設定を取り違えずに渡す（data.md 2章）・先の日の上限も渡す・対象外アプリを渡す・
// 許可していないものだけを、許可してほしい順に出す（Kotlin がない端末では出さない）。
import type { ConfigSnapshot } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { permissionGuide } from "@/components/child/child-view";
import {
  ESSENTIAL_PACKAGES,
  LEARNING_PACKAGES,
  RESTRICTION_UPCOMING_DAYS,
  toNativeRestriction,
} from "@/lib/usage-calc";

const snapshot: ConfigSnapshot = {
  childId: "c",
  configVersion: 7,
  calculationVersion: 1,
  usualLimitMinutes: 120,
  plan: null,
  testPeriods: [
    {
      id: "t1",
      name: "数学",
      startDate: "2026-10-28",
      endDate: "2026-10-30",
      createdByUserId: "c",
      createdByRole: "child",
    },
  ],
  blankPeriods: [{ id: "b1", name: "秋休み", startDate: "2026-10-18", endDate: "2026-10-18" }],
  dailyLimits: [
    { date: "2026-10-17", kind: "limited", limitMinutes: 0 },
    { date: "2026-10-18", kind: "unlimited", blankPeriodId: "b1" },
    { date: "2026-10-19", kind: "limited", limitMinutes: 90 },
  ],
  excludedApps: [{ packageName: "com.example.studynote", label: "学習ノート", sinceVersion: 3 }],
  generatedAt: "2026-10-17T00:00:00.000Z",
};

describe("toNativeRestriction（C4 で Kotlin に渡す値）", () => {
  const r = toNativeRestriction(snapshot, "2026-10-17");

  it("今日の上限: 0 分は limited 0（制限なし・未設定にしない）", () => {
    expect(r.date).toBe("2026-10-17");
    expect(r.limit).toEqual({ kind: "limited", limitMinutes: 0 });
    expect(r.configVersion).toBe(7);
  });

  it("先の日の上限を、翌日から決まった日数ぶん渡す（空白期間は unlimited・一覧にない日は unset）", () => {
    expect(r.upcoming).toHaveLength(RESTRICTION_UPCOMING_DAYS);
    expect(r.upcoming?.[0]).toEqual({ date: "2026-10-18", limit: { kind: "unlimited" } });
    expect(r.upcoming?.[1]).toEqual({ date: "2026-10-19", limit: { kind: "limited", limitMinutes: 90 } });
    expect(r.upcoming?.[2]).toEqual({ date: "2026-10-20", limit: { kind: "unset" } });
    expect(r.upcoming?.at(-1)?.date).toBe("2026-10-31");
  });

  it("対象外アプリ（C9）・必須例外・学習用アプリを渡す（C3 と同じ一覧）", () => {
    expect(r.excludedPackages).toEqual(["com.example.studynote"]);
    expect(r.essentialPackages).toEqual([...ESSENTIAL_PACKAGES]);
    expect(r.learningPackages).toEqual([...LEARNING_PACKAGES]);
  });

  it("テスト期間をウィジェット用に渡す（名前と期間だけ。作った人などは渡さない）", () => {
    expect(r.testPeriods).toEqual([{ name: "数学", startDate: "2026-10-28", endDate: "2026-10-30" }]);
    expect(toNativeRestriction({ ...snapshot, testPeriods: [] }, "2026-10-17").testPeriods).toEqual([]);
  });
});

describe("permissionGuide（子01 の見守りのための許可）", () => {
  const all = { usageAccess: true, overlay: true, notifications: true, batteryOptimization: true };

  it("許可していないものだけを、重ねて表示 → 通知 → 電池 の順に出す", () => {
    const items = permissionGuide({ ...all, overlay: false, batteryOptimization: false }, true);
    expect(items.map((i) => i.permission)).toEqual(["overlay", "batteryOptimization"]);
    expect(
      permissionGuide({ ...all, overlay: false, notifications: false, batteryOptimization: false }, true).map(
        (i) => i.permission,
      ),
    ).toEqual(["overlay", "notifications", "batteryOptimization"]);
  });

  it("全部許可済み・まだ読んでいない・Kotlin がない端末では出さない。使用状況へのアクセスは使用量のカードが案内するので出さない", () => {
    expect(permissionGuide(all, true)).toEqual([]);
    expect(permissionGuide(null, true)).toEqual([]);
    expect(permissionGuide({ ...all, overlay: false }, false)).toEqual([]);
    expect(permissionGuide({ ...all, usageAccess: false }, true)).toEqual([]);
  });
});
