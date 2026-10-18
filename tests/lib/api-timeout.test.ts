// サーバが応答を返さないまま止まった・遅い・500 を返したときの、通信クライアント（api.ts）と C7・C8 の動き。
// 回帰: 前は signal を渡さない call() に時間制限がなく、応答が来ないと呼び出しが終わらなかった。usePolling は前の呼び出しが
//   終わるまで次を飛ばすので、設定の取得（C7）・利用記録の送信（C8）が二度と走らず、画面も送信待ちも止まったままになった。
import type { ConfigSnapshot, UsageDayReport } from "@contracts/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { call, DEFAULT_TIMEOUT_MS, errorOf } from "@/lib/api";
import { createConfigCache } from "@/lib/config-cache";
import { type KeyValueStorage, storageKeys } from "@/lib/storage";
import { createUsageOutbox } from "@/lib/usage-outbox";

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
}

// 応答を返さないサーバ（本物の fetch と同じく、signal が止まったら AbortError で終わる）
function hangingFetch() {
  const seen: AbortSignal[] = [];
  vi.stubGlobal("fetch", (_url: string, init: { signal?: AbortSignal }) => {
    const signal = init.signal;
    if (signal) seen.push(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  return seen;
}

const snap = (configVersion: number): ConfigSnapshot => ({
  childId: "c1",
  configVersion,
  calculationVersion: configVersion,
  usualLimitMinutes: 60,
  plan: null,
  testPeriods: [],
  blankPeriods: [],
  dailyLimits: [{ date: "2026-10-17", kind: "limited", limitMinutes: 60 }],
  excludedApps: [],
  blockedSites: [],
  generatedAt: "2026-10-17T00:00:00.000Z",
});

const day: UsageDayReport = {
  date: "2026-10-17",
  measuredAt: "2026-10-17T03:00:00.000Z",
  restrictedMinutes: 25,
  apps: [],
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("signal を渡さない call() にも時間制限がある", () => {
  it("応答が来ないまま DEFAULT_TIMEOUT_MS たつと、timeout のエラーで終わる（終わらないままにならない）", async () => {
    const seen = hangingFetch();
    const p = call("planGet", { childId: "c1" }).catch((e) => e);
    expect(seen).toHaveLength(1); // signal が付いている
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    expect(errorOf(await p)?.code).toBe("timeout");
  });

  it("見出しは届いたが本文が届かないときも timeout", async () => {
    vi.stubGlobal("fetch", (_url: string, init: { signal?: AbortSignal }) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });
    const p = call("planGet", { childId: "c1" }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    expect(errorOf(await p)?.code).toBe("timeout");
  });

  it("自分で渡した signal はそのまま使う（画面が決めた短い時間制限を上書きしない）", async () => {
    const seen = hangingFetch();
    const own = new AbortController();
    const p = call("planGet", { childId: "c1" }, { signal: own.signal }).catch((e) => e);
    expect(seen[0]).toBe(own.signal);
    own.abort();
    expect(errorOf(await p)).toBeNull(); // 自分で止めたので表示しない
  });
});

describe("C7: サーバが止まった・遅いとき、手元の組を stale で出し続ける（0 分や空にしない）", () => {
  it("応答が来ないと時間切れで stale（network）を返し、手元の組と版を保つ。次の取得もできる", async () => {
    const storage = memoryStorage();
    await storage.setItem(
      storageKeys.config("c1"),
      JSON.stringify({ snapshot: snap(5), savedAt: "2026-10-17T00:00:00.000Z" }),
    );
    const cache = createConfigCache({
      storage,
      fetchConfig: (childId, knownVersion) => call("configGet", { childId, knownVersion }),
    });
    hangingFetch();
    const p = cache.refresh("c1");
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    const state = await p;
    expect(state.status).toBe("stale");
    if (state.status !== "stale") return;
    expect(state.reason).toBe("network");
    expect(state.error?.code).toBe("timeout");
    expect(state.snapshot.configVersion).toBe(5);
    expect(state.snapshot.dailyLimits[0]).toEqual({ date: "2026-10-17", kind: "limited", limitMinutes: 60 });

    // サーバが戻ったら、次の取得で新しい組を採用する（前の呼び出しが終わっているので、次が走れる）
    vi.stubGlobal("fetch", () =>
      Promise.resolve(Response.json({ changed: true, snapshot: snap(6), epoch: "epoch-1" })),
    );
    const next = await cache.refresh("c1");
    expect(next.status).toBe("fresh");
    if (next.status === "fresh") expect(next.snapshot.configVersion).toBe(6);
  });

  it("サーバが 500（形の読めない HTML）を返しても stale で、手元の組は消さない", async () => {
    const storage = memoryStorage();
    await storage.setItem(
      storageKeys.config("c1"),
      JSON.stringify({ snapshot: snap(5), savedAt: "2026-10-17T00:00:00.000Z" }),
    );
    const cache = createConfigCache({
      storage,
      fetchConfig: (childId, knownVersion) => call("configGet", { childId, knownVersion }),
    });
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("<html>500</html>", { status: 500 })));
    const state = await cache.refresh("c1");
    expect(state.status).toBe("stale");
    if (state.status === "stale") expect(state.snapshot.configVersion).toBe(5);
  });
});

describe("C8: サーバが止まった・遅い・500 のとき、送信待ちは消えずに後で送られる", () => {
  function setup() {
    let nowMs = Date.parse("2026-10-17T03:00:00Z");
    const outbox = createUsageOutbox({
      storage: memoryStorage(),
      send: (upload) => call("usageUpload", upload),
      now: () => new Date(nowMs),
      newId: () => "00000000-0000-4000-8000-000000000001",
    });
    return { outbox, advance: (ms: number) => (nowMs += ms) };
  }

  it("応答が来ないと時間切れで flush が終わり、記録は送信待ちに残る。次の flush で同じ送信 ID で送る", async () => {
    const { outbox, advance } = setup();
    await outbox.enqueue("c1", [day]);
    hangingFetch();
    const p = outbox.flush();
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    expect(await p).toMatchObject({ sent: 0, retrying: 1 });
    const [item] = await outbox.list();
    expect(item?.state).toBe("pending");
    expect(item?.lastError?.code).toBe("timeout");

    const sent: unknown[] = [];
    vi.stubGlobal("fetch", (_url: string, init: { body?: string }) => {
      const body = JSON.parse(init.body ?? "{}");
      sent.push(body);
      return Promise.resolve(
        Response.json({ submissionId: body.submissionId, status: "accepted", appliedDates: ["2026-10-17"] }),
      );
    });
    advance(60_000); // 間をあけた後（バックオフ）
    expect(await outbox.flush()).toMatchObject({ sent: 1 });
    expect(sent).toEqual([{ submissionId: "00000000-0000-4000-8000-000000000001", childId: "c1", days: [day] }]);
    expect(await outbox.list()).toEqual([]);
  });

  it("500（形の読めない HTML）・通信できないは一時的な失敗として送信待ちに残す（隔離しない）", async () => {
    const { outbox, advance } = setup();
    await outbox.enqueue("c1", [day]);
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("<html>500</html>", { status: 500 })));
    expect(await outbox.flush()).toMatchObject({ retrying: 1, quarantined: 0 });
    advance(60_000);
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Network request failed")));
    expect(await outbox.flush()).toMatchObject({ retrying: 1, quarantined: 0 });
    expect((await outbox.list())[0]?.state).toBe("pending");
  });
});
