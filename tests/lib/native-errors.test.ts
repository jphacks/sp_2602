// Kotlin のモジュールはあるが、関数が例外を出したとき（Activity がない・OS に断られた など）に、
// src/lib/native.ts が例外を外へ出さず、安全な既定値を返すことの確認（child-data.tsx の refresh が途中で止まらないように）。
// あわせて、Kotlin が返した値はそのまま渡すことも確かめる。
import { describe, expect, it, vi } from "vitest";

const boom = () => {
  throw new Error("Kotlin の例外");
};

vi.mock("expo", () => ({
  requireOptionalNativeModule: () => ({
    getPermissions: boom,
    openPermissionSettings: boom,
    getDailyUsage: async () => {
      throw new Error("OS のエラー");
    },
    saveRestriction: boom,
    startEngine: boom,
    stopEngine: boom,
    getEngineStatus: () => ({ running: true, restrictionDate: "2026-10-17" }),
    showLimitReached: boom,
    openApp: () => true,
    clearLocalData: boom,
  }),
}));

describe("native（Kotlin が例外を出す）", () => {
  it("例外を外へ出さず、既定値を返す。使用時間は 0 分ではなく unavailable", async () => {
    const { native } = await import("@/lib/native");
    expect(native.available).toBe(true);
    expect(native.getPermissions()).toEqual({
      usageAccess: false,
      overlay: false,
      notifications: false,
      batteryOptimization: false,
    });
    expect(native.showLimitReached()).toBe(false);
    const usage = await native.getDailyUsage("2026-10-17");
    expect(usage).toEqual({ status: "unavailable", reason: "OS のエラー" });
    expect(() => {
      native.openPermissionSettings("notifications");
      native.startEngine();
      native.stopEngine();
      native.clearLocalData();
      native.saveRestriction({
        date: "2026-10-17",
        limit: { kind: "limited", limitMinutes: 60 },
        excludedPackages: [],
        essentialPackages: [],
        learningPackages: [],
        configVersion: 1,
        testPeriods: [],
      });
    }).not.toThrow();
  });

  it("Kotlin が返した値はそのまま渡す", async () => {
    const { native } = await import("@/lib/native");
    expect(native.getEngineStatus()).toEqual({ running: true, restrictionDate: "2026-10-17" });
    expect(native.openApp("com.duolingo")).toBe(true);
  });
});
