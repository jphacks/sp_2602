// Kotlin のモジュールが無いとき（Expo Go・テスト）に、src/lib/native.ts が落ちずに安全な値を返すことの確認。
import { describe, expect, it, vi } from "vitest";

// expo は React Native 向けなので、Node のテストでは「モジュールが無い」状態の代わりを置く
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));

describe("native（モジュールなし）", () => {
  it("落ちずに、権限なし・ルールなし・停止中・使用時間は空を返す", async () => {
    const { native } = await import("@/lib/native");
    expect(native.available).toBe(false);
    expect(native.ping()).toBeNull();
    expect(native.getPermissions()).toEqual({ usageAccess: false, accessibility: false, overlay: false });
    expect(native.loadRules()).toBeNull();
    expect(native.getEngineStatus()).toEqual({ running: false, rulesUpdatedAt: null });
    expect(native.getUsage("2026-10-17")).toEqual({ date: "2026-10-17", apps: [] });
    expect(() => {
      native.startEngine();
      native.stopEngine();
      native.openPermissionSettings("overlay");
      native.saveRules({ childId: "c", limits: [], updatedAt: "2026-10-17T00:00:00.000Z" });
    }).not.toThrow();
  });
});
