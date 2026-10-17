// 確かめ役（V）: C3・C7・C8 の境界（MVP_SPEC 4.2・4.3、AC-09・AC-12・AC-14・AC-16）。
//   C3: 上限 0・未設定・制限なし・取得不可・権限なしを取り違えない。0 分と表示しない
//   C7: 古い応答を捨てる・通信失敗で stale・版を混ぜない。サーバの configGet とつないで確かめる
//   C8: 同じ送信 ID の再送・新しい測定が勝つ・検証エラーの隔離。サーバの usageUpload とつないで確かめる

import { ApiError } from "@contracts/errors";
import type { NativeUsageResult } from "@contracts/native";
import { ConfigResult, type ConfigSnapshot, type UsageUpload, UsageUploadResult } from "@contracts/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { ApiCallError } from "@/lib/api";
import { createConfigCache } from "@/lib/config-cache";
import type { KeyValueStorage } from "@/lib/storage";
import { calcUsage, ESSENTIAL_PACKAGES, limitForDate, toUsageDayReport } from "@/lib/usage-calc";
import { createUsageOutbox } from "@/lib/usage-outbox";
import { resetStore } from "@/server/mock/store";
import { CHILD, CHILD_ID, clock, fresh, ok, PARENT, post, versionOf } from "./helpers";

const TODAY = "2026-10-15";

const usageOf = (apps: [string, number][]): NativeUsageResult => ({
  status: "ok",
  date: TODAY,
  measuredAt: "2026-10-15T03:00:00.000Z",
  apps: apps.map(([packageName, usedMinutes]) => ({ packageName, label: packageName, usedMinutes })),
});

describe("V: C3 の境界", () => {
  const calc = (apps: [string, number][], limit: Parameters<typeof calcUsage>[0]["limit"], excluded: string[] = []) =>
    calcUsage({ usage: usageOf(apps), limit, excludedPackages: excluded });

  it("上限 0 分: 使用 0 分でも到達・表示 100%・残り 0%（0 で割らない）", () => {
    expect(calc([], { kind: "set", minutes: 0 })).toMatchObject({
      state: "ok",
      displayUsedPercent: 100,
      remainingPercent: 0,
      reached: true,
      usedMinutes: 0,
    });
  });

  it("上限 0 分でも、対象外アプリだけを使った子どもの usedMinutes は 0", () => {
    const r = calc([["com.example.studynote", 50]], { kind: "set", minutes: 0 }, ["com.example.studynote"]);
    expect(r).toMatchObject({ state: "ok", usedMinutes: 0, reached: true });
  });

  it("未設定・制限なし・取得不可は ok にならず、割合の数字を持たない", () => {
    for (const [limit, state] of [
      [{ kind: "unset" }, "limit_unset"],
      [{ kind: "unlimited" }, "unlimited"],
      [{ kind: "unknown" }, "limit_unknown"],
    ] as const) {
      const r = calc([["a", 10]], limit);
      expect(r.state).toBe(state);
      expect("displayUsedPercent" in r).toBe(false);
    }
  });

  it("制限なし（空白期間）は使った分を持つが到達しない", () => {
    expect(calc([["a", 2000]], { kind: "unlimited" })).toEqual({ state: "unlimited", usedMinutes: 2000 });
  });

  it("権限なし・実績が取れないは、上限の状態より先に返す（上限が分からなくても・0 分でも 0 分の実績にしない）", () => {
    for (const limit of [{ kind: "set", minutes: 0 }, { kind: "unknown" }, { kind: "unset" }] as const) {
      expect(calcUsage({ usage: { status: "permission_denied" }, limit, excludedPackages: [] }).state).toBe(
        "permission_denied",
      );
      expect(calcUsage({ usage: { status: "unavailable", reason: "x" }, limit, excludedPackages: [] }).state).toBe(
        "usage_unavailable",
      );
    }
  });

  it("上限が負・NaN・Infinity はエラー（limit_invalid）", () => {
    for (const minutes of [-1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(calc([["a", 1]], { kind: "set", minutes }).state, String(minutes)).toBe("limit_invalid");
  });

  it("必須例外（電話など）は対象外アプリに入れていなくても合計に入らない", () => {
    const r = calc(
      [
        [ESSENTIAL_PACKAGES[0] as string, 30],
        ["game", 30],
      ],
      { kind: "set", minutes: 60 },
    );
    expect(r).toMatchObject({ state: "ok", usedMinutes: 30, displayUsedPercent: 50 });
  });

  it("limitForDate: その日が 0 分の上限なら set 0（未設定ではない）。組はあるがその日がないのは unset", () => {
    const snap = {
      dailyLimits: [{ date: TODAY, kind: "limited", limitMinutes: 0 }],
      blankPeriods: [],
      testPeriods: [],
    } as unknown as ConfigSnapshot;
    expect(limitForDate(snap, TODAY)).toEqual({ kind: "set", minutes: 0 });
    expect(limitForDate(snap, "2026-10-16")).toEqual({ kind: "unset" });
    expect(limitForDate(null, TODAY)).toEqual({ kind: "unknown" });
  });

  it("C8 で送る記録の restrictedMinutes は C3 の usedMinutes と同じ（親の分数と子の割合の元がそろう）", () => {
    const u = usageOf([
      ["game", 30],
      ["com.example.studynote", 20],
      [ESSENTIAL_PACKAGES[1] as string, 15],
    ]);
    const excluded = ["com.example.studynote"];
    const report = toUsageDayReport(u as Extract<NativeUsageResult, { status: "ok" }>, excluded);
    const r = calcUsage({ usage: u, limit: { kind: "set", minutes: 60 }, excludedPackages: excluded });
    expect(r.state === "ok" && r.usedMinutes).toBe(report.restrictedMinutes);
  });
});

// ── サーバとつなぐための道具 ──

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

// サーバの応答を、アプリの call() と同じ形（成功は契約で検査・失敗は ApiCallError）にする
async function asCall<T>(res: Response, parse: (x: unknown) => T): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new ApiCallError(ApiError.parse(body), res.status);
  return parse(body);
}

const serverConfig = (token: string) => (childId: string, knownVersion: number | undefined) =>
  post("/api/config/get", { childId, knownVersion }, token).then((r) => asCall(r, (b) => ConfigResult.parse(b)));

describe("V: C7 をサーバとつないで確かめる", () => {
  beforeEach(() => {
    fresh("2026-10-15T03:00:00Z");
  });

  it("親が変えると、子どもの次の取得で新しい組（版が上がった）を採用し、その版の日別上限・対象外アプリを使う", async () => {
    const cache = createConfigCache({ storage: memoryStorage(), fetchConfig: serverConfig(CHILD) });
    const first = await cache.refresh(CHILD_ID);
    expect(first.status).toBe("fresh");
    const v = await versionOf(CHILD_ID, PARENT);
    await ok(
      post(
        "/api/excluded-apps/save",
        { childId: CHILD_ID, expectedVersion: v, apps: [{ packageName: "z.z", label: "Z" }] },
        PARENT,
      ),
    );
    const second = await cache.refresh(CHILD_ID);
    if (second.status !== "fresh") throw new Error(second.status);
    expect(second.snapshot.configVersion).toBe(v + 1);
    expect(second.snapshot.excludedApps.map((a) => a.packageName)).toEqual(["z.z"]);
    // 3回目は同じ版を送るので、サーバは中身を省き、手元の組がそのまま fresh。親の画面には「反映済み」
    expect((await cache.refresh(CHILD_ID)).status).toBe("fresh");
    const view = await ok<{ childAppliedVersion: number; configVersion: number }>(
      post("/api/excluded-apps/get", { childId: CHILD_ID }, PARENT),
    );
    expect(view.childAppliedVersion).toBe(view.configVersion);
  });

  it("通信できないときは最後の正常な組を stale（network）で返す。最初から通信できなければ unavailable（0 分で埋めない）", async () => {
    let online = true;
    const fetchConfig = async (childId: string, known: number | undefined) => {
      if (!online) throw new ApiCallError({ code: "network", message: "x", hint: "" }, 0);
      return serverConfig(CHILD)(childId, known);
    };
    const empty = createConfigCache({
      storage: memoryStorage(),
      fetchConfig: async () => {
        throw new ApiCallError({ code: "network", message: "x", hint: "" }, 0);
      },
    });
    const none = await empty.refresh(CHILD_ID);
    expect(none.status).toBe("unavailable");
    expect(limitForDate(none.status === "unavailable" ? null : none.snapshot, TODAY)).toEqual({ kind: "unknown" });

    const cache = createConfigCache({ storage: memoryStorage(), fetchConfig });
    await cache.refresh(CHILD_ID);
    online = false;
    const s = await cache.refresh(CHILD_ID);
    expect(s).toMatchObject({ status: "stale", reason: "network" });
  });

  it("サーバのエラー（401・403・500）も stale で、手元の組は消さない", async () => {
    const storage = memoryStorage();
    const good = createConfigCache({ storage, fetchConfig: serverConfig(CHILD) });
    await good.refresh(CHILD_ID);
    for (const token of ["bad-token", PARENT.replace("parent", "nobody")]) {
      const bad = createConfigCache({ storage, fetchConfig: serverConfig(token) });
      expect((await bad.refresh(CHILD_ID)).status).toBe("stale");
    }
    // ほかの子どもの childId を聞いても 403 で stale（ほかの子どもの組を採用しない）
    const other = createConfigCache({ storage, fetchConfig: (_id, k) => serverConfig(CHILD)("other-child", k) });
    expect((await other.refresh(CHILD_ID)).status).toBe("stale");
  });

  it("遅れて届いた古い版の応答は捨て（older_response）、手元の新しい組を保つ", async () => {
    const storage = memoryStorage();
    // 古い版の応答を先に取っておく
    const oldResult = await serverConfig(CHILD)(CHILD_ID, undefined);
    const v = await versionOf(CHILD_ID, PARENT);
    await ok(post("/api/plan/usual-limit", { childId: CHILD_ID, expectedVersion: v, usualLimitMinutes: 33 }, PARENT));
    const cache = createConfigCache({ storage, fetchConfig: serverConfig(CHILD) });
    await cache.refresh(CHILD_ID); // 新しい版を保存
    const late = createConfigCache({ storage, fetchConfig: async () => oldResult });
    const s = await late.refresh(CHILD_ID);
    expect(s).toMatchObject({ status: "stale", reason: "older_response" });
    if (s.status === "unavailable") throw new Error("x");
    expect(s.snapshot.configVersion).toBe(v + 1);
    expect(s.snapshot.usualLimitMinutes).toBe(33);
  });

  it("【注意・MOCK だけ】サーバを再起動して版の番号が戻ると、子どもの端末は新しい設定を取り込めない", async () => {
    // 仕様どおりの動き（古い版の応答は捨てる・同じ版なら手元を使う）だが、メモリ上の MOCK のサーバを再起動したデモでは困る。
    // 本物の DB では版が戻らないので起きない。デモで再起動したら、子どもの端末の設定のキャッシュを消す（ログアウト等）こと
    const storage = memoryStorage();
    const cache = createConfigCache({ storage, fetchConfig: serverConfig(CHILD) });
    const bump = async (minutes: number) => {
      const v = await versionOf(CHILD_ID, PARENT);
      await ok(
        post("/api/plan/usual-limit", { childId: CHILD_ID, expectedVersion: v, usualLimitMinutes: minutes }, PARENT),
      );
    };
    await bump(11);
    await bump(12);
    const cached = await cache.refresh(CHILD_ID);
    if (cached.status !== "fresh") throw new Error(cached.status);
    const cachedVersion = cached.snapshot.configVersion;

    // (a) 再起動後、サーバの版が手元より小さい → 「古い応答」として捨て、stale のまま
    resetStore({ seed: true, now: () => new Date(clock.ms) });
    await bump(21);
    expect(await versionOf(CHILD_ID, PARENT)).toBe(cachedVersion - 1);
    expect(await cache.refresh(CHILD_ID)).toMatchObject({ status: "stale", reason: "older_response" });

    // (b) 再起動後、サーバの版が手元と同じ番号になる → サーバは「変わっていない」と返し、手元の古い中身を fresh として使い続ける
    await bump(22);
    expect(await versionOf(CHILD_ID, PARENT)).toBe(cachedVersion);
    const s = await cache.refresh(CHILD_ID);
    expect(s.status).toBe("fresh");
    if (s.status === "unavailable") throw new Error("x");
    expect(s.snapshot.usualLimitMinutes).toBe(12); // サーバは 22
  });
});

describe("V: C8 をサーバとつないで確かめる", () => {
  beforeEach(() => {
    fresh("2026-10-15T03:00:00Z");
  });

  const day = (date: string, measuredAt: string, minutes: number) => ({
    date,
    measuredAt,
    restrictedMinutes: minutes,
    apps: [{ packageName: "g.g", label: "G", usedMinutes: minutes, excluded: false }],
  });

  const send = (upload: UsageUpload) =>
    post("/api/usage/upload", upload, CHILD).then((r) => asCall(r, (b) => UsageUploadResult.parse(b)));

  const usedOn = async (date: string) =>
    (
      await ok<{ days: { usedMinutes: number | null }[] }>(
        post("/api/usage/get", { childId: CHILD_ID, from: date, to: date }, PARENT),
      )
    ).days[0]?.usedMinutes;

  it("サーバには保存できたが応答が消えた → 同じ送信 ID で送り直し、duplicate で送信待ちから消える。記録は1つ", async () => {
    const storage = memoryStorage();
    let loseResponse = true;
    const sentIds: string[] = [];
    const outbox = createUsageOutbox({
      storage,
      now: () => new Date(clock.ms),
      send: async (u) => {
        sentIds.push(u.submissionId);
        const r = await send(u);
        if (loseResponse) {
          loseResponse = false;
          throw new ApiCallError({ code: "network", message: "x", hint: "" }, 0);
        }
        return r;
      },
    });
    await outbox.enqueue(CHILD_ID, [day(TODAY, "2026-10-15T02:00:00Z", 42)]);
    expect(await outbox.flush()).toMatchObject({ sent: 0, retrying: 1 });
    clock.addMs(31_000); // バックオフ（30 秒）の後
    expect(await outbox.flush()).toMatchObject({ sent: 1 });
    expect(sentIds[0]).toBe(sentIds[1]);
    expect(await outbox.list()).toEqual([]);
    expect(await usedOn(TODAY)).toBe(42);
  });

  it("後から作った（新しく測った）記録が先に届いても、古い記録が後から届いて上書きしない", async () => {
    const outbox = createUsageOutbox({ storage: memoryStorage(), now: () => new Date(clock.ms), send });
    const old = await outbox.enqueue(CHILD_ID, [day(TODAY, "2026-10-15T01:00:00Z", 10)]);
    // 新しいほうを先に直接送る（別の経路で届いた想定）
    await send({
      submissionId: crypto.randomUUID(),
      childId: CHILD_ID,
      days: [day(TODAY, "2026-10-15T02:30:00Z", 70)],
    });
    expect(old).not.toBeNull();
    await outbox.flush();
    expect(await outbox.list()).toEqual([]); // 受け付けられた（appliedDates は空）ので送信待ちから消える
    expect(await usedOn(TODAY)).toBe(70);
  });

  it("直らない失敗（ほかの子どもの childId = 403・同じ送信 ID で中身違い = 409）は、その記録だけ隔離し、ほかは送る。自動で送り直さない", async () => {
    // 先に同じ送信 ID で別の中身を送っておく（409 になる記録を作る）
    const usedId = crypto.randomUUID();
    await send({ submissionId: usedId, childId: CHILD_ID, days: [day("2026-10-13", "2026-10-13T14:00:00Z", 1)] });
    let calls = 0;
    const ids = [usedId, crypto.randomUUID(), crypto.randomUUID()];
    const outbox = createUsageOutbox({
      storage: memoryStorage(),
      now: () => new Date(clock.ms),
      newId: () => ids.shift() as string,
      send: (u) => {
        calls++;
        return send(u);
      },
    });
    await outbox.enqueue(CHILD_ID, [day("2026-10-13", "2026-10-13T14:00:00Z", 2)]); // 409
    await outbox.enqueue("other-child", [day(TODAY, "2026-10-15T02:00:00Z", 10)]); // 403
    await outbox.enqueue(CHILD_ID, [day("2026-10-14", "2026-10-14T14:00:00Z", 20)]); // 送れる
    expect(await outbox.flush()).toMatchObject({ sent: 1, quarantined: 2 });
    const left = await outbox.list();
    expect(left.map((x) => [x.state, x.lastError?.code])).toEqual([
      ["quarantined", "conflict"],
      ["quarantined", "forbidden"],
    ]);
    clock.addMs(60 * 60_000);
    const before = calls;
    await outbox.flush();
    expect(calls).toBe(before);
    expect(await usedOn("2026-10-14")).toBe(20);
  });

  it("ログインが切れた（401）ときは隔離せず、送信待ちのまま送り直す", async () => {
    const outbox = createUsageOutbox({
      storage: memoryStorage(),
      now: () => new Date(clock.ms),
      send: (u) =>
        post("/api/usage/upload", u, "expired-token").then((r) => asCall(r, (b) => UsageUploadResult.parse(b))),
    });
    await outbox.enqueue(CHILD_ID, [day(TODAY, "2026-10-15T02:00:00Z", 10)]);
    expect(await outbox.flush()).toMatchObject({ retrying: 1, quarantined: 0 });
    expect((await outbox.list())[0]?.state).toBe("pending");
  });
});
