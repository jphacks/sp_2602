// C7 の設定のキャッシュのテスト（MVP_SPEC 4.3・AC-14）。版のそろった組だけを採用し、古い応答を捨て、通信失敗では最後の正常な組を stale で返す。
import type { ConfigResult, ConfigSnapshot } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { ApiCallError } from "@/lib/api";
import { createConfigCache, reconcileConfig } from "@/lib/config-cache";
import type { KeyValueStorage } from "@/lib/storage";

const snap = (configVersion: number, limit = 60): ConfigSnapshot => ({
  childId: "c1",
  configVersion,
  calculationVersion: configVersion,
  usualLimitMinutes: limit,
  plan: null,
  testPeriods: [],
  blankPeriods: [],
  dailyLimits: [{ date: "2026-10-15", kind: "limited", limitMinutes: limit }],
  excludedApps: [],
  generatedAt: `2026-10-15T00:00:0${configVersion}.000Z`,
});
const changed = (s: ConfigSnapshot): ConfigResult => ({ changed: true, snapshot: s });

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
    removeItem: async (k) => {
      data.delete(k);
    },
  };
}

const networkError = () => new ApiCallError({ code: "network", message: "通信できませんでした", hint: "" }, 0);

describe("reconcileConfig（純粋な判断）", () => {
  it("手元がなければ採用する", () => {
    expect(reconcileConfig("c1", null, changed(snap(1)))).toEqual({ action: "adopt", snapshot: snap(1) });
  });

  it("新しい版は採用、古い版の応答は捨てる", () => {
    expect(reconcileConfig("c1", snap(2), changed(snap(3))).action).toBe("adopt");
    expect(reconcileConfig("c1", snap(3), changed(snap(2)))).toEqual({ action: "discard", reason: "older_response" });
  });

  it("同じ版で同じ中身（作った時刻だけ違う）は keep、中身が違うのは整合性エラー", () => {
    expect(reconcileConfig("c1", snap(2), changed({ ...snap(2), generatedAt: "x" })).action).toBe("keep");
    expect(reconcileConfig("c1", snap(2), changed(snap(2, 99)))).toEqual({ action: "discard", reason: "integrity" });
  });

  it("別の子どもの組・同じ日付が2つある組は採用しない", () => {
    expect(reconcileConfig("c1", null, changed({ ...snap(1), childId: "c2" })).action).toBe("discard");
    const dup = { ...snap(1), dailyLimits: [...snap(1).dailyLimits, ...snap(1).dailyLimits] };
    expect(reconcileConfig("c1", null, changed(dup))).toEqual({ action: "discard", reason: "invalid" });
  });

  it("「変わっていない」と言われたが手元にその版がないなら取り直す", () => {
    expect(reconcileConfig("c1", snap(1), { changed: false, configVersion: 1 })).toEqual({ action: "keep" });
    expect(reconcileConfig("c1", null, { changed: false, configVersion: 1 })).toEqual({ action: "refetch" });
  });
});

describe("createConfigCache", () => {
  it("取得した組を保存し、次は手元の版を送る。同じ版なら fresh のまま", async () => {
    const storage = memoryStorage();
    const sent: (number | undefined)[] = [];
    const cache = createConfigCache({
      storage,
      fetchConfig: async (_id, known) => {
        sent.push(known);
        return known === 1 ? { changed: false, configVersion: 1 } : changed(snap(1));
      },
    });
    expect((await cache.refresh("c1")).status).toBe("fresh");
    const again = await cache.refresh("c1");
    expect(again.status).toBe("fresh");
    expect(sent).toEqual([undefined, 1]);
  });

  it("通信に失敗したら最後の正常な組を stale で返す。手元もなければ unavailable（0 分で埋めない）", async () => {
    const storage = memoryStorage();
    let fail = false;
    const cache = createConfigCache({
      storage,
      fetchConfig: async () => {
        if (fail) throw networkError();
        return changed(snap(1));
      },
    });
    const empty = createConfigCache({
      storage: memoryStorage(),
      fetchConfig: async () => Promise.reject(networkError()),
    });
    expect((await empty.refresh("c1")).status).toBe("unavailable");
    await cache.refresh("c1");
    fail = true;
    const r = await cache.refresh("c1");
    expect(r.status).toBe("stale");
    if (r.status === "stale") {
      expect(r.reason).toBe("network");
      expect(r.snapshot.configVersion).toBe(1);
      expect(r.error?.code).toBe("network");
    }
  });

  it("古い版の応答では手元の新しい組を上書きしない", async () => {
    const storage = memoryStorage();
    const replies = [changed(snap(3)), changed(snap(2))];
    const cache = createConfigCache({ storage, fetchConfig: async () => replies.shift() as ConfigResult });
    await cache.refresh("c1");
    const r = await cache.refresh("c1");
    expect(r.status).toBe("stale");
    if (r.status !== "unavailable") expect(r.snapshot.configVersion).toBe(3);
    expect((await cache.load("c1")).status === "stale").toBe(true);
  });

  it("遅れて届いた古い応答は、待っている間に保存された新しい組を上書きしない（読み直して比べる）", async () => {
    const storage = memoryStorage();
    let release: (r: ConfigResult) => void = () => {};
    const slow = new Promise<ConfigResult>((r) => {
      release = r;
    });
    let calls = 0;
    const cache = createConfigCache({
      storage,
      fetchConfig: async () => (++calls === 1 ? slow : changed(snap(5))),
    });
    const first = cache.refresh("c1"); // 古い応答を待っている
    await cache.refresh("c1"); // 先に新しい組（版 5）が保存される
    release(changed(snap(4)));
    const r = await first;
    if (r.status === "unavailable") throw new Error("組があるはず");
    expect(r.snapshot.configVersion).toBe(5);
  });

  it("load は通信せずに端末の組だけを返す（not_checked の stale）", async () => {
    const storage = memoryStorage();
    const cache = createConfigCache({ storage, fetchConfig: async () => changed(snap(1)) });
    expect((await cache.load("c1")).status).toBe("unavailable");
    await cache.refresh("c1");
    const r = await cache.load("c1");
    expect(r.status === "stale" && r.reason === "not_checked").toBe(true);
  });
});
