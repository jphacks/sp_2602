// Kotlin のモジュールが無いとき（Expo Go・テスト）に、src/lib/native.ts が落ちずに安全な値を返すことの確認。
// 使用時間が取れないときは 0 分ではなく unavailable を返す（MVP_SPEC 4.2）。
import { describe, expect, it, vi } from "vitest";

// expo は React Native 向けなので、Node のテストでは「モジュールが無い」状態の代わりを置く
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));

describe("native（モジュールなし）", () => {
  it("落ちずに、権限なし・使用時間は取得不可・停止中・制限画面は出せない、を返す", async () => {
    const { native, setFakeUsage } = await import("@/lib/native");
    setFakeUsage(false);
    expect(native.available).toBe(false);
    expect(native.ping()).toBeNull();
    // 権限の種類は contracts/native.ts の NativePermission（K-A で accessibility をやめ、notifications・batteryOptimization を足した。
    // D-111 で、制限する Web サイトのためだけに accessibility を足し直した）
    expect(native.getPermissions()).toEqual({
      usageAccess: false,
      overlay: false,
      notifications: false,
      batteryOptimization: false,
      accessibility: false,
    });
    expect((await native.getDailyUsage("2026-10-17")).status).toBe("unavailable");
    // アプリ一覧も 0 個ではなく unavailable（空の一覧を送って親16 の候補を消さないように。Q15）
    expect((await native.getLauncherApps()).status).toBe("unavailable");
    expect(native.getEngineStatus()).toEqual({ running: false, restrictionDate: null });
    expect(native.showLimitReached()).toBe(false);
    expect(native.openApp("com.example.studynote")).toBe(false);
    expect(() => {
      native.startEngine();
      native.stopEngine();
      native.openPermissionSettings("overlay");
      native.clearLocalData();
      native.saveRestriction({
        date: "2026-10-17",
        limit: { kind: "unset" },
        excludedPackages: [],
        essentialPackages: [],
        learningPackages: [],
        configVersion: 0,
        testPeriods: [],
        blockedSites: [],
      });
      native.saveParentWidget({ days: [], testPeriods: [] }); // 保護者のウィジェット（親08）
    }).not.toThrow();
  });

  it("開発用の仮の値を有効にすると、仮の使用時間を返す（native.fake で分かる）", async () => {
    const { native, setFakeUsage } = await import("@/lib/native");
    setFakeUsage(true);
    const r = await native.getDailyUsage("2026-10-17");
    expect(r.status).toBe("ok");
    expect(native.fake).toBe(true);
    // 仮のアプリ一覧は、仮の使用時間と同じアプリを packageName の順で（Kotlin の返す形にそろえる）
    const apps = await native.getLauncherApps();
    expect(apps.status).toBe("ok");
    const names = apps.status === "ok" ? apps.apps.map((a) => a.packageName) : [];
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual([...names].sort());
    setFakeUsage(false);
  });
});
