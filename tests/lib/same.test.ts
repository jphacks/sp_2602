// 取り直した値が前と同じ中身なら前の値を返す（src/lib/same.ts の keepIfSame）。
// 30 秒ごとの取り直しで、中身が同じ設定の組・権限を毎回新しい入れ物で入れ、親・子どもの全部の画面を描き直していた
// （親はウィジェットへの保存も毎回やり直していた）ことの回帰テスト。
import { describe, expect, it } from "vitest";
import type { ConfigState } from "@/lib/config-cache";
import { keepIfSame } from "@/lib/same";

const snapshot = {
  childId: "c1",
  configVersion: 3,
  generatedAt: "2026-10-17T00:00:00.000Z",
  plan: null,
  usualLimitMinutes: 120,
  dailyLimits: [{ date: "2026-10-17", limitMinutes: 120 }],
  testPeriods: [],
  blankPeriods: [],
  excludedApps: [],
} as unknown as Extract<ConfigState, { status: "fresh" }>["snapshot"];

const fresh = (savedAt: string): ConfigState => ({ status: "fresh", snapshot: structuredClone(snapshot), savedAt });

describe("keepIfSame", () => {
  it("同じ中身の設定の組を新しい入れ物で取り直したら、前の入れ物のまま（描き直さない）", () => {
    const prev = fresh("2026-10-17T00:00:00.000Z");
    const next = fresh("2026-10-17T00:00:00.000Z");
    expect(next).not.toBe(prev);
    expect(keepIfSame(prev, next)).toBe(prev);
  });

  it("中身が変わったら（新しい版を保存した・古いキャッシュになった）新しい値にする", () => {
    const prev = fresh("2026-10-17T00:00:00.000Z");
    expect(keepIfSame(prev, fresh("2026-10-17T00:05:00.000Z"))).not.toBe(prev);
    const stale: ConfigState = {
      status: "stale",
      snapshot,
      savedAt: "2026-10-17T00:00:00.000Z",
      reason: "network",
      error: null,
    };
    expect(keepIfSame(prev, stale)).toBe(stale);
  });

  it("権限の状態も、同じなら前の値のまま。1つでも変われば新しい値", () => {
    const prev = { usageAccess: true, overlay: false, notifications: true, batteryOptimization: false };
    expect(keepIfSame(prev, { ...prev })).toBe(prev);
    const next = { ...prev, overlay: true };
    expect(keepIfSame(prev, next)).toBe(next);
  });

  it("まだ値がない（null）ときは新しい値にする。新しい値が null なら null", () => {
    const next = fresh("x");
    expect(keepIfSame<ConfigState | null>(null, next)).toBe(next);
    expect(keepIfSame<ConfigState | null>(next, null)).toBeNull();
  });
});
