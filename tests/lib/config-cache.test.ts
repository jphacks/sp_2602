// C7 の設定のキャッシュのテスト（MVP_SPEC 4.3・AC-14）。版のそろった組だけを採用し、古い応答を捨て、通信失敗では最後の正常な組を stale で返す。
// epoch（サーバの DB ごとに決まる値。D-109）が違えば、版を比べずに手元を捨てて届いた組を採用する。
import type { ConfigResult, ConfigSnapshot } from "@contracts/schemas";
import { describe, expect, it } from "vitest";
import { ApiCallError } from "@/lib/api";
import { createConfigCache, reconcileConfig } from "@/lib/config-cache";
import { type KeyValueStorage, storageKeys } from "@/lib/storage";

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
  blockedSites: [],
  generatedAt: `2026-10-15T00:00:0${configVersion}.000Z`,
});
const EPOCH = "epoch-a";
const changed = (s: ConfigSnapshot, epoch = EPOCH): ConfigResult => ({ changed: true, snapshot: s, epoch });
const same = (configVersion: number, epoch = EPOCH): ConfigResult => ({ changed: false, configVersion, epoch });
// 端末に保存してある組（epoch: null は epoch を足す前に保存した組）
const cachedOf = (s: ConfigSnapshot, epoch: string | null = EPOCH) =>
  epoch === null ? { snapshot: s } : { snapshot: s, epoch };

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
    expect(reconcileConfig("c1", null, changed(snap(1)))).toEqual({ action: "adopt", snapshot: snap(1), epoch: EPOCH });
  });

  it("新しい版は採用、古い版の応答は捨てる", () => {
    expect(reconcileConfig("c1", cachedOf(snap(2)), changed(snap(3))).action).toBe("adopt");
    expect(reconcileConfig("c1", cachedOf(snap(3)), changed(snap(2)))).toEqual({
      action: "discard",
      reason: "older_response",
    });
  });

  it("同じ版で同じ中身（作った時刻だけ違う）は keep、中身が違うのは整合性エラー", () => {
    expect(reconcileConfig("c1", cachedOf(snap(2)), changed({ ...snap(2), generatedAt: "x" })).action).toBe("keep");
    expect(reconcileConfig("c1", cachedOf(snap(2)), changed(snap(2, 99)))).toEqual({
      action: "discard",
      reason: "integrity",
    });
  });

  it("別の子どもの組・同じ日付が2つある組は採用しない", () => {
    expect(reconcileConfig("c1", null, changed({ ...snap(1), childId: "c2" })).action).toBe("discard");
    const dup = { ...snap(1), dailyLimits: [...snap(1).dailyLimits, ...snap(1).dailyLimits] };
    expect(reconcileConfig("c1", null, changed(dup))).toEqual({ action: "discard", reason: "invalid" });
  });

  it("「変わっていない」と言われたが手元にその版がないなら取り直す", () => {
    expect(reconcileConfig("c1", cachedOf(snap(1)), same(1))).toEqual({ action: "keep" });
    expect(reconcileConfig("c1", null, same(1))).toEqual({ action: "refetch" });
  });
});

describe("reconcileConfig の epoch（D-109。サーバの DB が変わったら版を比べない）", () => {
  it("epoch が違えば、手元より小さい版でも古い応答として捨てずに採用する（DB を作り直して版が 0 から数え直された）", () => {
    expect(reconcileConfig("c1", cachedOf(snap(9)), changed(snap(2), "epoch-b"))).toEqual({
      action: "adopt",
      snapshot: snap(2),
      epoch: "epoch-b",
    });
  });

  it("epoch が違えば、同じ版で中身が違っても整合性エラーにせず採用する", () => {
    expect(reconcileConfig("c1", cachedOf(snap(2)), changed(snap(2, 99), "epoch-b"))).toMatchObject({
      action: "adopt",
      epoch: "epoch-b",
    });
  });

  it("版が同じで「変わっていない」と言われても、epoch が違えば取り直す（手元の古い中身を最新として使わない）", () => {
    expect(reconcileConfig("c1", cachedOf(snap(3)), same(3, "epoch-b"))).toEqual({ action: "refetch" });
  });

  it("epoch が同じなら今までどおり: 古い版の応答は捨てる・同じ版で違う中身は整合性エラー", () => {
    expect(reconcileConfig("c1", cachedOf(snap(3), "epoch-b"), changed(snap(2), "epoch-b"))).toEqual({
      action: "discard",
      reason: "older_response",
    });
    expect(reconcileConfig("c1", cachedOf(snap(2), "epoch-b"), changed(snap(2, 99), "epoch-b"))).toEqual({
      action: "discard",
      reason: "integrity",
    });
  });

  it("epoch のない古い保存分は「epoch が違う」として扱う（大きな版でも捨てて採用・変わっていないなら取り直す）", () => {
    expect(reconcileConfig("c1", cachedOf(snap(9), null), changed(snap(1)))).toMatchObject({
      action: "adopt",
      epoch: EPOCH,
    });
    expect(reconcileConfig("c1", cachedOf(snap(1), null), same(1))).toEqual({ action: "refetch" });
  });

  it("epoch が違っても、別の子どもの組・日付が重複した組は採用しない", () => {
    expect(reconcileConfig("c1", cachedOf(snap(1)), changed({ ...snap(1), childId: "c2" }, "epoch-b")).action).toBe(
      "discard",
    );
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
        return known === 1 ? same(1) : changed(snap(1));
      },
    });
    expect((await cache.refresh("c1")).status).toBe("fresh");
    const again = await cache.refresh("c1");
    expect(again.status).toBe("fresh");
    expect(sent).toEqual([undefined, 1]);
  });

  it("新しい版を採用したら、すぐにその版をサーバへ知らせる（次の取得を待たずに「反映済み」にする）。同じ版のままなら知らせない", async () => {
    const storage = memoryStorage();
    let serverVersion = 1;
    const acked: number[] = [];
    const cache = createConfigCache({
      storage,
      fetchConfig: async (_id, known) => (known === serverVersion ? same(serverVersion) : changed(snap(serverVersion))),
      ackAdopted: async (_id, version) => {
        acked.push(version);
      },
    });
    await cache.refresh("c1"); // 初めての取得で版 1 を採用 → 知らせる
    await cache.refresh("c1"); // 変わっていない → 知らせない
    serverVersion = 2; // 保護者が保存した
    await cache.refresh("c1"); // 版 2 を採用 → 知らせる
    expect(acked).toEqual([1, 2]);
  });

  it("知らせるのに失敗しても、採用した組はそのまま fresh（取得の結果を変えない）", async () => {
    const cache = createConfigCache({
      storage: memoryStorage(),
      fetchConfig: async () => changed(snap(1)),
      ackAdopted: async () => {
        throw networkError();
      },
    });
    expect((await cache.refresh("c1")).status).toBe("fresh");
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

  it("epoch つきで保存し、epoch が変わったら（版が同じ「変わっていない」でも）knownVersion なしで取り直して置き換える", async () => {
    const storage = memoryStorage();
    const sent: (number | undefined)[] = [];
    let server = { epoch: EPOCH, snapshot: snap(3, 60) };
    const cache = createConfigCache({
      storage,
      fetchConfig: async (_id, known) => {
        sent.push(known);
        return known === server.snapshot.configVersion
          ? same(server.snapshot.configVersion, server.epoch)
          : changed(server.snapshot, server.epoch);
      },
    });
    await cache.refresh("c1");
    expect(JSON.parse(storage.data.get(storageKeys.config("c1")) ?? "{}").epoch).toBe(EPOCH);
    server = { epoch: "epoch-b", snapshot: snap(3, 15) }; // DB を作り直し、たまたま同じ版 3 になった
    const r = await cache.refresh("c1");
    expect(r.status).toBe("fresh");
    if (r.status === "unavailable") throw new Error("組があるはず");
    expect(r.snapshot.usualLimitMinutes).toBe(15);
    expect(sent).toEqual([undefined, 3, undefined]);
    expect(JSON.parse(storage.data.get(storageKeys.config("c1")) ?? "{}").epoch).toBe("epoch-b");
    // 次からは新しい epoch の版として「変わっていない」が通る
    expect((await cache.refresh("c1")).status).toBe("fresh");
    expect(sent.at(-1)).toBe(3);
  });

  it("epoch のない古い保存分も読める（起動直後に出せる）が、次の取得では版を送らずに取り直し、届いた組で置き換える", async () => {
    const storage = memoryStorage();
    storage.data.set(
      storageKeys.config("c1"),
      JSON.stringify({ snapshot: snap(9, 60), savedAt: "2026-10-15T00:00:00Z" }),
    );
    const sent: (number | undefined)[] = [];
    const cache = createConfigCache({
      storage,
      fetchConfig: async (_id, known) => {
        sent.push(known);
        return changed(snap(2, 15));
      },
    });
    const loaded = await cache.load("c1");
    expect(loaded).toMatchObject({ status: "stale", reason: "not_checked" });
    const r = await cache.refresh("c1");
    expect(r.status).toBe("fresh");
    if (r.status === "unavailable") throw new Error("組があるはず");
    expect(r.snapshot.configVersion).toBe(2);
    expect(r.snapshot.usualLimitMinutes).toBe(15);
    expect(sent).toEqual([undefined]);
    expect(JSON.parse(storage.data.get(storageKeys.config("c1")) ?? "{}").epoch).toBe(EPOCH);
  });

  it("制限する Web サイト（D-111）を足す前に保存した組（blockedSites がない）も読め、登録なし（空）として扱う。同じ版の応答とも食い違わない", async () => {
    const storage = memoryStorage();
    const { blockedSites: _, ...old } = snap(2);
    storage.data.set(storageKeys.config("c1"), JSON.stringify({ snapshot: old, savedAt: "x", epoch: EPOCH }));
    const cache = createConfigCache({ storage, fetchConfig: async () => changed(snap(2)) });
    const loaded = await cache.load("c1");
    expect(loaded.status === "stale" && loaded.snapshot.blockedSites).toEqual([]);
    const r = await cache.refresh("c1");
    expect(r.status).toBe("fresh");
  });
});
