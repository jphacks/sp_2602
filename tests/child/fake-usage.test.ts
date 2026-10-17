// 開発用の仮の使用時間（EXPO_PUBLIC_FAKE_USAGE=1 と同じ setFakeUsage(true)）で、子どもの画面の表示がつながることの確認。
// Kotlin がない端末でも、C2（仮の値）→ C3 → 子01 の「％ 使いました」まで出る。仮の値がオフなら「取得不可」で、0% とは出さない。
import { describe, expect, it, vi } from "vitest";
import { usageView } from "@/components/child/child-view";
import { calcUsage } from "@/lib/usage-calc";

vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));

describe("仮の使用時間から 子01 の表示まで", () => {
  it("仮の値がオンなら割合（0〜100 の整数）が出る", async () => {
    const { native, setFakeUsage } = await import("@/lib/native");
    setFakeUsage(true);
    try {
      expect(native.fake).toBe(true);
      const usage = await native.getDailyUsage("2026-10-15");
      const v = usageView(calcUsage({ usage, limit: { kind: "set", minutes: 240 }, excludedPackages: [] }), null);
      expect(v.kind).toBe("percent");
      if (v.kind === "percent") {
        expect(Number.isInteger(v.percent)).toBe(true);
        expect(v.percent).toBeGreaterThanOrEqual(0);
        expect(v.percent).toBeLessThanOrEqual(100);
      }
    } finally {
      setFakeUsage(false);
    }
  });

  it("仮の値がオフで Kotlin もなければ「使った時間を取得できませんでした」（0% ではない）", async () => {
    const { native, setFakeUsage } = await import("@/lib/native");
    setFakeUsage(false);
    const usage = await native.getDailyUsage("2026-10-15");
    const v = usageView(calcUsage({ usage, limit: { kind: "set", minutes: 240 }, excludedPackages: [] }), null);
    expect(v).toMatchObject({ kind: "message", reason: "usage_unavailable" });
  });
});
