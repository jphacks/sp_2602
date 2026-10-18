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
    getLauncherApps: async () => {
      throw new Error("一覧のエラー");
    },
    saveRestriction: boom,
    startEngine: boom,
    stopEngine: boom,
    getEngineStatus: () => ({ running: true, restrictionDate: "2026-10-17" }),
    showLimitReached: boom,
    openApp: () => true,
    clearLocalData: boom,
    releaseDeviceOwner: boom,
    isEngineEnabled: boom,
    clearParentLocalData: boom,
    setStatusReporter: boom,
    clearStatusReporter: boom,
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
      accessibility: false,
    });
    expect(native.showLimitReached()).toBe(false);
    // Device Owner をやめられなくても、外へ出さず false（連携が外れたときのほかの片付けを止めない。D-133）
    expect(native.releaseDeviceOwner()).toBe(false);
    // 監視が動いているか分からないときは「動いている」とみなす（ログアウトで監視を止めないように。D-136）
    expect(native.isEngineEnabled()).toBe(true);
    const usage = await native.getDailyUsage("2026-10-17");
    expect(usage).toEqual({ status: "unavailable", reason: "OS のエラー" });
    // アプリ一覧（Q15）も、例外は外へ出さず unavailable（0 個の一覧にしない）
    expect(await native.getLauncherApps()).toEqual({ status: "unavailable", reason: "一覧のエラー" });
    expect(() => {
      native.openPermissionSettings("notifications");
      native.startEngine();
      native.stopEngine();
      native.clearLocalData();
      native.clearParentLocalData();
      native.setStatusReporter("https://example.test/api/device-status/report", "t", "c1");
      native.clearStatusReporter();
      native.saveRestriction({
        date: "2026-10-17",
        limit: { kind: "limited", limitMinutes: 60 },
        excludedPackages: [],
        essentialPackages: [],
        learningPackages: [],
        configVersion: 1,
        testPeriods: [],
        blockedSites: [],
      });
    }).not.toThrow();
  });

  it("Kotlin が返した値はそのまま渡す", async () => {
    const { native } = await import("@/lib/native");
    expect(native.getEngineStatus()).toEqual({ running: true, restrictionDate: "2026-10-17" });
    expect(native.openApp("com.duolingo")).toBe(true);
  });
});
