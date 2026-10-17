// ログアウトで、設定のキャッシュ（C7）とその人の送信待ち（C8）を消すテスト（src/lib/sign-out.ts）。
// 別の人で入り直したときに、前の人の設定やまだ送っていない記録が混ざらないこと、ほかの子どもの送信待ちは消さないことを確かめる。
import type { ConfigSnapshot, UsageDayReport } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { createConfigCache } from "@/lib/config-cache";
import { clearLocalDataFor } from "@/lib/sign-out";
import { type KeyValueStorage, storageKeys } from "@/lib/storage";
import { createUsageOutbox } from "@/lib/usage-outbox";

function memoryStorage(): KeyValueStorage & { keys: () => string[] } {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
    keys: () => [...data.keys()],
  };
}

const snapshot = (childId: string): ConfigSnapshot => ({
  childId,
  configVersion: 1,
  calculationVersion: 1,
  usualLimitMinutes: 120,
  plan: null,
  testPeriods: [],
  blankPeriods: [],
  dailyLimits: [{ date: "2026-10-15", kind: "limited", limitMinutes: 120 }],
  excludedApps: [],
  generatedAt: "2026-10-15T03:00:00.000Z",
});

const day = (date: string): UsageDayReport => ({
  date,
  measuredAt: `${date}T03:00:00.000Z`,
  restrictedMinutes: 10,
  apps: [],
});

function setup() {
  const storage = memoryStorage();
  const configCache = createConfigCache({
    storage,
    fetchConfig: async (childId) => ({ changed: true, snapshot: snapshot(childId) }),
  });
  const usageOutbox = createUsageOutbox({
    storage,
    send: async () => {
      throw new Error("offline"); // 送れないので送信待ちに残る
    },
  });
  return { storage, configCache, usageOutbox };
}

describe("ログアウトで端末のデータを消す", () => {
  it("設定のキャッシュは全部消し、送信待ちはその人（子ども）の分だけ消す", async () => {
    const { storage, configCache, usageOutbox } = setup();
    await configCache.refresh("child-a");
    await configCache.refresh("child-b");
    await usageOutbox.enqueue("child-a", [day("2026-10-15")]);
    await usageOutbox.enqueue("child-b", [day("2026-10-15")]);

    await clearLocalDataFor("child-a", { configCache, usageOutbox });

    expect((await configCache.load("child-a")).status).toBe("unavailable");
    expect((await configCache.load("child-b")).status).toBe("unavailable");
    expect(storage.keys().filter((k) => k.startsWith("slope.config"))).toEqual([]);
    expect((await usageOutbox.list()).map((x) => x.childId)).toEqual(["child-b"]);
  });

  it("別の人で入り直したら、前の人の設定は出てこない（取り直すまで「取得不可」）", async () => {
    const { configCache, usageOutbox } = setup();
    await configCache.refresh("child-a");
    await clearLocalDataFor("child-a", { configCache, usageOutbox });
    expect(await configCache.load("child-a")).toMatchObject({ status: "unavailable" });
  });

  it("片方が失敗しても、もう片方は消す", async () => {
    const { usageOutbox } = setup();
    await usageOutbox.enqueue("child-a", [day("2026-10-15")]);
    await clearLocalDataFor("child-a", {
      configCache: {
        clearAll: async () => {
          throw new Error("storage broken");
        },
      },
      usageOutbox,
    });
    expect(await usageOutbox.list()).toEqual([]);
  });

  it("clear(childId) は一覧からも外す（clearAll で消し忘れない・二重に数えない）", async () => {
    const { storage, configCache } = setup();
    await configCache.refresh("child-a");
    await configCache.refresh("child-b");
    await configCache.clear("child-a");
    expect(JSON.parse((await storage.getItem(storageKeys.configIndex)) ?? "[]")).toEqual(["child-b"]);
  });
});
