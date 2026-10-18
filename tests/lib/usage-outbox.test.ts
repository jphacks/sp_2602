// C8 の送信待ちのテスト（MVP_SPEC 4.3・AC-12）。同じ送信 ID で送り直す・成功分だけ消す・一時的な失敗は間をあけて再送・検証エラーは隔離。
import type { UsageDayReport, UsageUpload } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { ApiCallError } from "@/lib/api";
import { type KeyValueStorage, storageKeys } from "@/lib/storage";
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

describe("C8: 契約に合わない記録は、その1件だけを隔離する（ほかの記録を消さない）", () => {
  it("enqueue: 合う記録は送り、合わない記録は別の1件にして隔離する（lastError: bad_request）", async () => {
    const sent: UsageUpload[] = [];
    const { outbox } = setup(async (u) => sent.push(u));
    const bad = { ...day("2026-10-14", 5), restrictedMinutes: 5000 }; // 契約外（0〜1440）
    await outbox.enqueue("c1", [day("2026-10-15", 10), bad]);
    expect(await outbox.flush()).toMatchObject({ sent: 1, quarantined: 1 });
    expect(sent.map((u) => u.days.map((d) => d.date))).toEqual([["2026-10-15"]]);
    const [left] = await outbox.list();
    expect(left).toMatchObject({ state: "quarantined", days: [], lastError: { code: "bad_request" } });
    expect(left?.rejectedDays).toEqual([bad]);
  });

  it("読むとき: 端末に保存してあった記録のうち、合わない1件だけを隔離し、ほかの1件は送る", async () => {
    const storage = memoryStorage();
    const stored = (id: string, d: unknown) => ({
      submissionId: id,
      childId: "c1",
      days: [d],
      createdAt: "2026-10-15T00:00:00.000Z",
      attempts: 0,
      nextAttemptAt: "2026-10-15T00:00:00.000Z",
      state: "pending",
      lastError: null,
    });
    // 古い版のアプリが書いた・壊れた記録（measuredAt が日時でない）と、正しい記録
    await storage.setItem(
      storageKeys.outbox,
      JSON.stringify([
        stored("00000000-0000-4000-8000-0000000000a1", { ...day("2026-10-14", 5), measuredAt: "not-a-date" }),
        stored("00000000-0000-4000-8000-0000000000a2", day("2026-10-15", 7)),
        "読めない値",
      ]),
    );
    const sent: UsageUpload[] = [];
    const outbox = createUsageOutbox({
      storage,
      send: async (u) => {
        sent.push(u);
        return { submissionId: u.submissionId, status: "accepted", appliedDates: [] };
      },
      now: () => new Date("2026-10-15T03:00:00Z"),
    });
    expect(await outbox.flush()).toMatchObject({ sent: 1, quarantined: 1 });
    expect(sent[0]?.submissionId).toBe("00000000-0000-4000-8000-0000000000a2");
    const left = await outbox.list();
    expect(left.map((i) => [i.submissionId, i.state, i.lastError?.code])).toEqual([
      ["00000000-0000-4000-8000-0000000000a1", "quarantined", "bad_request"],
    ]);
  });

  it("契約に合わない記録だけの1件は、retryQuarantined でも送る対象に戻さない", async () => {
    const { outbox } = setup(async () => undefined);
    const item = await outbox.enqueue("c1", [{ ...day("2026-10-15", 5), date: "2026-13-40" }]);
    await outbox.retryQuarantined(item?.submissionId ?? "");
    expect((await outbox.list())[0]?.state).toBe("quarantined");
    expect(await outbox.flush()).toMatchObject({ sent: 0, quarantined: 1 });
  });
});

describe("C8: 送信待ちを消した（removeChild）あとに、消す前に始まった書き込みを戻さない（D-133 の再検査）", () => {
  // 読み出し（getItem）を外から止められる保存（書き込みの途中で removeChild を割り込ませる）
  function heldStorage() {
    const data = new Map<string, string>();
    const hold: { get?: Promise<void> } = {};
    const storage: KeyValueStorage = {
      getItem: async (k) => {
        await hold.get;
        return data.get(k) ?? null;
      },
      setItem: async (k, v) => void data.set(k, v),
      removeItem: async (k) => void data.delete(k),
    };
    return { storage, hold, data };
  }
  const pause = () => {
    let release: () => void = () => undefined;
    const until = new Promise<void>((r) => (release = r));
    return { until, release };
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("enqueue が書く前に、その子どもの送信待ちを消したら、書かずに null（外された子どもの記録を戻さない）", async () => {
    const { storage, hold } = heldStorage();
    let n = 0;
    const outbox = createUsageOutbox({
      storage,
      send: async (u) => ({ submissionId: u.submissionId, status: "accepted", appliedDates: [] }),
      now: () => new Date("2026-10-15T03:00:00Z"),
      newId: () => `00000000-0000-4000-8000-00000000000${++n}`,
    });
    await outbox.enqueue("c1", [day("2026-10-14", 1)]);
    const reading = pause();
    hold.get = reading.until;
    const pending = outbox.enqueue("c1", [day("2026-10-15", 2)]);
    await tick();
    const removing = outbox.removeChild("c1");
    reading.release();
    expect(await pending).toBeNull();
    await removing;
    hold.get = undefined;
    expect(await outbox.list()).toEqual([]);
  });

  it("ほかの子どもの書き込みは捨てない。消したあとに始めた書き込みは入る", async () => {
    const { storage, hold } = heldStorage();
    const outbox = createUsageOutbox({
      storage,
      send: async (u) => ({ submissionId: u.submissionId, status: "accepted", appliedDates: [] }),
      now: () => new Date("2026-10-15T03:00:00Z"),
    });
    const reading = pause();
    hold.get = reading.until;
    const other = outbox.enqueue("c2", [day("2026-10-15", 3)]);
    await tick();
    const removing = outbox.removeChild("c1");
    reading.release();
    expect(await other).not.toBeNull();
    await removing;
    hold.get = undefined;
    expect(await outbox.enqueue("c1", [day("2026-10-15", 4)])).not.toBeNull();
    expect((await outbox.list()).map((i) => i.childId).sort()).toEqual(["c1", "c2"]);
  });

  it("送り終えて送信待ちを書き直している途中に消しても、消した記録を書き戻さない", async () => {
    const { storage, hold } = heldStorage();
    const reading = pause();
    const outbox = createUsageOutbox({
      storage,
      send: async (u) => {
        // 送り終えたあとの書き直し（update）の読み出しで止める
        hold.get = reading.until;
        return { submissionId: u.submissionId, status: "accepted", appliedDates: [] };
      },
      now: () => new Date("2026-10-15T03:00:00Z"),
    });
    await outbox.enqueue("c1", [day("2026-10-14", 1)]);
    await outbox.enqueue("c1", [day("2026-10-15", 2)]);
    const flushing = outbox.flush();
    await tick();
    const removing = outbox.removeChild("c1");
    reading.release();
    hold.get = undefined;
    await Promise.all([flushing, removing]);
    expect(await outbox.list()).toEqual([]);
  });

  it("送っている途中に、その子どもの送信待ちを消したら、読んだ一覧の残りは送らない（ほかの子どもの分は送る）", async () => {
    const sending = pause();
    const sent: string[] = [];
    let n = 0;
    const outbox = createUsageOutbox({
      storage: memoryStorage(),
      send: async (u) => {
        sent.push(`${u.childId}:${u.days[0]?.date}`);
        if (sent.length === 1) await sending.until; // 1件目を送っている途中で止める
        return { submissionId: u.submissionId, status: "accepted", appliedDates: [] };
      },
      now: () => new Date("2026-10-15T03:00:00Z"),
      newId: () => `00000000-0000-4000-8000-00000000000${++n}`,
    });
    await outbox.enqueue("c1", [day("2026-10-14", 1)]);
    await outbox.enqueue("c1", [day("2026-10-15", 2)]);
    await outbox.enqueue("c2", [day("2026-10-15", 3)]);
    const flushing = outbox.flush();
    await tick();
    expect(sent).toEqual(["c1:2026-10-14"]);
    await outbox.removeChild("c1");
    sending.release();
    const result = await flushing;
    // c1 の2件目は送らない。c2 は送る
    expect(sent).toEqual(["c1:2026-10-14", "c2:2026-10-15"]);
    expect(result.sent).toBe(2);
    expect(await outbox.list()).toEqual([]);
  });
});

describe("C8: 端末の一覧の読み・書きは1つずつ順に行う（exclusive）", () => {
  it("同時に2本 enqueue しても、両方の記録が残る（読んでから書くまでの間に、もう1本が割り込んで上書きしない）", async () => {
    // 読み出し（getItem）を外から止めて、2本とも読み終えてから書く順になりうるようにする
    const data = new Map<string, string>();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const storage: KeyValueStorage = {
      getItem: async (k) => {
        await gate;
        return data.get(k) ?? null;
      },
      setItem: async (k, v) => void data.set(k, v),
      removeItem: async (k) => void data.delete(k),
    };
    let n = 0;
    const outbox = createUsageOutbox({
      storage,
      send: async (u) => ({ submissionId: u.submissionId, status: "accepted", appliedDates: [] }),
      now: () => new Date("2026-10-15T03:00:00Z"),
      newId: () => `00000000-0000-4000-8000-00000000000${++n}`,
    });
    const a = outbox.enqueue("c1", [day("2026-10-14", 1)]);
    const b = outbox.enqueue("c1", [day("2026-10-15", 2)]);
    await new Promise((r) => setTimeout(r, 0));
    release();
    expect(await a).not.toBeNull();
    expect(await b).not.toBeNull();
    const stored = JSON.parse(data.get(storageKeys.outbox) ?? "[]") as { days: { date: string }[] }[];
    expect(stored.map((i) => i.days[0]?.date).sort()).toEqual(["2026-10-14", "2026-10-15"]);
  });
});
