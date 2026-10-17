// C8 の送信待ちのテスト（MVP_SPEC 4.3・AC-12）。同じ送信 ID で送り直す・成功分だけ消す・一時的な失敗は間をあけて再送・検証エラーは隔離。
import type { UsageDayReport, UsageUpload } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { ApiCallError } from "@/lib/api";
import type { KeyValueStorage } from "@/lib/storage";
import { backoffMs, createUsageOutbox, isPermanentError, newSubmissionId } from "@/lib/usage-outbox";

const day = (date: string, minutes: number): UsageDayReport => ({
  date,
  measuredAt: `${date}T03:00:00.000Z`,
  restrictedMinutes: minutes,
  apps: [],
});

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

const fail = (code: "network" | "bad_request" | "conflict" | "upstream_failed") =>
  new ApiCallError({ code, message: code, hint: "" }, 0);

function setup(send: (u: UsageUpload) => Promise<unknown>) {
  let nowMs = Date.parse("2026-10-15T03:00:00Z");
  let n = 0;
  const outbox = createUsageOutbox({
    storage: memoryStorage(),
    send: async (u) => {
      await send(u);
      return { submissionId: u.submissionId, status: "accepted", appliedDates: [] };
    },
    now: () => new Date(nowMs),
    newId: () => `00000000-0000-4000-8000-00000000000${++n}`,
  });
  return { outbox, advance: (ms: number) => (nowMs += ms) };
}

describe("C8: 送信待ち", () => {
  it("成功したら送信待ちから消す", async () => {
    const sent: UsageUpload[] = [];
    const { outbox } = setup(async (u) => sent.push(u));
    await outbox.enqueue("c1", [day("2026-10-15", 10)]);
    expect(await outbox.flush()).toMatchObject({ sent: 1 });
    expect(await outbox.list()).toEqual([]);
    expect(sent[0]?.days[0]?.restrictedMinutes).toBe(10);
  });

  it("通信の失敗は送信待ちのまま、同じ送信 ID で、間をあけて送り直す", async () => {
    const ids: string[] = [];
    let down = true;
    const { outbox, advance } = setup(async (u) => {
      ids.push(u.submissionId);
      if (down) throw fail("network");
    });
    await outbox.enqueue("c1", [day("2026-10-15", 10)]);
    expect(await outbox.flush()).toMatchObject({ retrying: 1 });
    // 間があくまでは送らない（バックオフ）
    expect(await outbox.flush()).toMatchObject({ skipped: 1 });
    advance(backoffMs(1));
    down = false;
    expect(await outbox.flush()).toMatchObject({ sent: 1 });
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]); // 送り直しても同じ送信 ID
  });

  it("検証エラー（直らない失敗）はその記録だけ隔離し、ほかの記録は送り続ける。自動では送り直さない", async () => {
    const { outbox, advance } = setup(async (u) => {
      if (u.days[0]?.restrictedMinutes === 99) throw fail("bad_request");
    });
    await outbox.enqueue("c1", [day("2026-10-14", 99)]);
    await outbox.enqueue("c1", [day("2026-10-15", 10)]);
    expect(await outbox.flush()).toMatchObject({ sent: 1, quarantined: 1 });
    advance(60 * 60_000);
    expect(await outbox.flush()).toMatchObject({ sent: 0, quarantined: 1 });
    const [left] = await outbox.list();
    expect(left?.state).toBe("quarantined");
    expect(left?.lastError?.code).toBe("bad_request");
  });

  it("同時に2回 flush しても、同じ記録を並べて送らない", async () => {
    let calls = 0;
    const { outbox } = setup(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
    });
    await outbox.enqueue("c1", [day("2026-10-15", 10)]);
    await Promise.all([outbox.flush(), outbox.flush()]);
    expect(calls).toBe(1);
  });

  it("送っている間に足された記録は消さない", async () => {
    let addLater: (() => Promise<unknown>) | null = null;
    const { outbox } = setup(async () => {
      if (addLater) {
        const f = addLater;
        addLater = null;
        await f();
      }
    });
    await outbox.enqueue("c1", [day("2026-10-14", 1)]);
    addLater = () => outbox.enqueue("c1", [day("2026-10-15", 2)]);
    await outbox.flush();
    const left = await outbox.list();
    expect(left.map((i) => i.days[0]?.date)).toEqual(["2026-10-15"]);
  });

  it("直らない失敗の分け方: bad_request・forbidden・conflict・not_found は隔離、ほかは送り直す", () => {
    expect(isPermanentError(fail("conflict").error)).toBe(true);
    expect(isPermanentError(fail("upstream_failed").error)).toBe(false);
    expect(isPermanentError(fail("network").error)).toBe(false);
  });

  it("送信 ID は UUID の形", () => {
    expect(newSubmissionId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
