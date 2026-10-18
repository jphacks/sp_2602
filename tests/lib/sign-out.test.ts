// ログアウトで、設定のキャッシュ（C7）とその人の送信待ち（C8）と、前に送ったアプリの一覧（Q15）を消すテスト（src/lib/sign-out.ts）。
// 別の人で入り直したときに、前の人の設定やまだ送っていない記録が混ざらないこと、ほかの子どもの送信待ちは消さないことを確かめる。
// あわせて、ログアウトで合言葉をサーバでも無効にすること（revokeServerSession。失敗してもログアウトは進める）を確かめる。
import { mockSessions } from "@contracts/fixtures";
import type { ConfigSnapshot, UsageDayReport } from "@contracts/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiCallError, call, DEFAULT_TIMEOUT_MS, errorOf, setSessionToken, setUnauthorizedHandler } from "@/lib/api";
import { createAppIconCache } from "@/lib/app-icons";
import { createChildAppsSync } from "@/lib/child-apps-sync";
import { createConfigCache } from "@/lib/config-cache";
import { clearLocalDataFor, REVOKE_TIMEOUT_MS, revokeServerSession } from "@/lib/sign-out";
import { type KeyValueStorage, storageKeys } from "@/lib/storage";
import { createUsageOutbox } from "@/lib/usage-outbox";
import app from "@/server/app";
import { resetDatabaseForTests } from "@/server/db";

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
  blockedSites: [],
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
    fetchConfig: async (childId) => ({ changed: true, snapshot: snapshot(childId), epoch: "epoch-1" }),
  });
  const usageOutbox = createUsageOutbox({
    storage,
    send: async () => {
      throw new Error("offline"); // 送れないので送信待ちに残る
    },
  });
  const childAppsSync = createChildAppsSync({
    storage,
    upload: async () => ({ iconsNeeded: [] }),
    uploadIcons: async () => ({}),
    epoch: async () => null,
  });
  const appIcons = createAppIconCache({ fetchList: async () => ({ apps: [] }), fetchIcons: async () => [] });
  return { storage, configCache, usageOutbox, childAppsSync, appIcons };
}

describe("ログアウトで端末のデータを消す", () => {
  it("設定のキャッシュは全部消し、送信待ちはその人（子ども）の分だけ消す", async () => {
    const { storage, configCache, usageOutbox, childAppsSync, appIcons } = setup();
    await configCache.refresh("child-a");
    await configCache.refresh("child-b");
    await usageOutbox.enqueue("child-a", [day("2026-10-15")]);
    await usageOutbox.enqueue("child-b", [day("2026-10-15")]);

    await clearLocalDataFor("child-a", { configCache, usageOutbox, childAppsSync, appIcons });

    expect((await configCache.load("child-a")).status).toBe("unavailable");
    expect((await configCache.load("child-b")).status).toBe("unavailable");
    expect(storage.keys().filter((k) => k.startsWith("slope.config"))).toEqual([]);
    expect((await usageOutbox.list()).map((x) => x.childId)).toEqual(["child-b"]);
  });

  it("別の人で入り直したら、前の人の設定は出てこない（取り直すまで「取得不可」）", async () => {
    const { configCache, usageOutbox, childAppsSync, appIcons } = setup();
    await configCache.refresh("child-a");
    await clearLocalDataFor("child-a", { configCache, usageOutbox, childAppsSync, appIcons });
    expect(await configCache.load("child-a")).toMatchObject({ status: "unavailable" });
  });

  it("片方が失敗しても、もう片方は消す", async () => {
    const { usageOutbox, childAppsSync, appIcons } = setup();
    await usageOutbox.enqueue("child-a", [day("2026-10-15")]);
    await clearLocalDataFor("child-a", {
      configCache: {
        clearAll: async () => {
          throw new Error("storage broken");
        },
      },
      usageOutbox,
      childAppsSync,
      appIcons,
    });
    expect(await usageOutbox.list()).toEqual([]);
  });

  it("前に送ったアプリの一覧（Q15）はその人の分だけ消し、入り直したら（中身が同じでも）もう一度送る", async () => {
    const { storage, configCache, usageOutbox, childAppsSync, appIcons } = setup();
    const getApps = async () => ({ status: "ok" as const, apps: [{ packageName: "com.example.a", label: "A" }] });
    expect(await childAppsSync.run("child-a", getApps)).toBe("sent");
    expect(await childAppsSync.run("child-b", getApps)).toBe("sent");
    await clearLocalDataFor("child-a", { configCache, usageOutbox, childAppsSync, appIcons });
    expect(await storage.getItem(storageKeys.childApps("child-a"))).toBeNull();
    expect(await storage.getItem(storageKeys.childApps("child-b"))).not.toBeNull();
    expect(await childAppsSync.run("child-a", getApps)).toBe("sent");
  });

  it("保護者の端末のメモリにある子どものアプリのアイコン（Q15）も消す", async () => {
    const { configCache, usageOutbox, childAppsSync } = setup();
    const appIcons = createAppIconCache({
      fetchList: async () => ({ apps: [{ packageName: "a", label: "A", iconHash: "a".repeat(64) }] }),
      fetchIcons: async () => [{ packageName: "a", iconHash: "a".repeat(64), png: "iVBORw0KGgo=" }],
    });
    await appIcons.load("child-a", ["a"]);
    expect(appIcons.peek("child-a", ["a"]).size).toBe(1);
    await clearLocalDataFor("parent-a", { configCache, usageOutbox, childAppsSync, appIcons });
    expect(appIcons.peek("child-a", ["a"]).size).toBe(0);
  });

  it("clear(childId) は一覧からも外す（clearAll で消し忘れない・二重に数えない）", async () => {
    const { storage, configCache } = setup();
    await configCache.refresh("child-a");
    await configCache.refresh("child-b");
    await configCache.clear("child-a");
    expect(JSON.parse((await storage.getItem(storageKeys.configIndex)) ?? "[]")).toEqual(["child-b"]);
  });
});

describe("ログアウトで合言葉をサーバでも無効にする（revokeServerSession）", () => {
  afterEach(() => {
    setSessionToken(null);
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  it("サーバとつないで: 呼んだあとは、その合言葉で呼ぶと 401（端末から抜き出された合言葉でも使えない）", async () => {
    await resetDatabaseForTests({ seed: true });
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => app.request(url, init));
    const token = mockSessions["mock-google-parent"].token;
    setSessionToken(token);
    await expect(call("authMe")).resolves.toMatchObject({ role: "parent" });

    await revokeServerSession();

    const e = await call("authMe").then(
      () => null,
      (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(ApiCallError);
    expect(errorOf(e)?.code).toBe("unauthorized");
  });

  it("通信できない・もう無効（401）・サーバの失敗でも、例外を投げずに終わる（ログアウトは進める）", async () => {
    for (const make of [
      () => Promise.reject(new TypeError("Network request failed")),
      () => Promise.resolve(Response.json({ code: "unauthorized", message: "x", hint: "y" }, { status: 401 })),
      () => Promise.resolve(new Response("oops", { status: 500 })),
    ]) {
      vi.stubGlobal("fetch", make);
      setSessionToken("some-token");
      await expect(revokeServerSession()).resolves.toBeUndefined();
    }
  });

  it("サーバが応答しないときは、待つ時間（REVOKE_TIMEOUT_MS）で切り上げる", async () => {
    let waitedMs = -1;
    const started = revokeServerSession({
      revoke: (signal) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")))),
      timeout: (ms) => {
        waitedMs = ms;
        const c = new AbortController();
        setTimeout(() => c.abort(), 1);
        return c.signal;
      },
    });
    await expect(started).resolves.toBeUndefined();
    expect(waitedMs).toBe(REVOKE_TIMEOUT_MS);
    expect(REVOKE_TIMEOUT_MS).toBeLessThan(DEFAULT_TIMEOUT_MS); // ふつうの呼び出しの時間切れより短い
  });
});
