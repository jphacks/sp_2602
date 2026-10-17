// MOCK のサーバ（src/server/mock/store.ts）の「時間がたつ・再起動する・途中でやめる」ときの決まりのテスト。
//   - 再起動しても、デモの子どもの設定の版が前の版より大きくなる（子どもの端末が新しい設定を取り込める。C7）
//   - 日別上限の残りが少なくなったら、configGet のときに作り足す（Q4: 今日から先を作り直す・昨日以前は変えない）
//   - 子どもの「やめる」で QR を取り消す（pairCancel。以後その code は使えない）
//   - 対象外アプリの一覧が最後に変わった版と、外したアプリの版（親16 の反映済み／反映待ちを、開き直しても正しく出す）
import { addDays } from "@contracts/dates";
import { mockSessions } from "@contracts/fixtures";
import type { ConfigResult, ConfigSnapshot, ExcludedAppsView, Session } from "@contracts/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { reconcileConfig } from "@/lib/config-cache";
import { LIMIT_HORIZON_DAYS, LIMIT_TOPUP_MIN_DAYS, MemoryStore, startupVersionBase } from "@/server/mock/store";
import { CHILD_ID, clock, codeOf, fresh, get, newFamily, newPerson, ok, post, versionOf } from "../verify/helpers";

const childSession = mockSessions["mock-google-child"] as Session;
const parentSession = mockSessions["mock-google-parent"] as Session;

const snapshotOf = (r: ConfigResult): ConfigSnapshot => {
  if (!r.changed) throw new Error("changed: true のはず");
  return r.snapshot;
};

describe("MOCK のサーバを再起動しても、設定の版が前より大きくなる（C7 で新しい設定を取り込めるように）", () => {
  const t1 = Date.parse("2026-10-15T03:00:00Z");
  const storeAt = (startMs: number, versionBase?: number) =>
    new MemoryStore({ seed: true, now: () => new Date(startMs), versionBase });

  it("前の起動で何回か変えた版（子どもの端末の手元）より、次の起動の版のほうが大きく、端末はそれを採用する", () => {
    const before = storeAt(t1, startupVersionBase(t1));
    let v = before.planView(CHILD_ID).configVersion;
    for (const minutes of [150, 160, 170]) v = before.usualLimitSave(CHILD_ID, v, minutes).configVersion;
    const onDevice = snapshotOf(before.configGet(childSession, CHILD_ID));
    expect(onDevice.configVersion).toBe(v);

    // 5 秒後に再起動（メモリの上のデータは消え、見本を入れ直す）
    const after = storeAt(t1 + 5_000, startupVersionBase(t1 + 5_000));
    const result = after.configGet(childSession, CHILD_ID, onDevice.configVersion);
    const fresh = snapshotOf(result);
    expect(fresh.configVersion).toBeGreaterThan(onDevice.configVersion);
    expect(reconcileConfig(CHILD_ID, onDevice, result)).toMatchObject({ action: "adopt" });
  });

  it("（比べるため）版を 0 から数え直すと、端末は「古い版」として捨ててしまう", () => {
    const before = storeAt(t1, 0);
    let v = before.planView(CHILD_ID).configVersion;
    for (const minutes of [150, 160, 170]) v = before.usualLimitSave(CHILD_ID, v, minutes).configVersion;
    const onDevice = snapshotOf(before.configGet(childSession, CHILD_ID));
    const result = storeAt(t1 + 5_000, 0).configGet(childSession, CHILD_ID, onDevice.configVersion);
    expect(reconcileConfig(CHILD_ID, onDevice, result)).toMatchObject({ action: "discard", reason: "older_response" });
  });

  it("起動時刻から数えるのはデモの子どもだけ。はじめての人（再起動で別の ID になる）は 0 から数える", async () => {
    fresh("2026-10-15T03:00:00Z", { versionBase: startupVersionBase(t1) });
    expect(await versionOf(CHILD_ID, parentSession.token)).toBeGreaterThanOrEqual(t1);
    const { child, parent } = await newFamily("restart");
    expect(await versionOf(child.userId, parent.token)).toBe(0);
  });

  it("startupVersionBase は時刻とともに増える（ミリ秒）", () => {
    expect(startupVersionBase(t1 + 1)).toBeGreaterThan(startupVersionBase(t1));
    expect(Number.isSafeInteger(startupVersionBase())).toBe(true);
  });
});

describe("日別上限の残りが少なくなったら、configGet で作り足す（Q4・Q6）", () => {
  beforeEach(() => {
    fresh("2026-10-15T03:00:00Z");
  });

  const configGet = (childId: string, token: string, knownVersion?: number) =>
    ok<ConfigResult>(post("/api/config/get", { childId, knownVersion }, token));

  it(`残りが ${LIMIT_TOPUP_MIN_DAYS} 日を切ったら、今日から ${LIMIT_HORIZON_DAYS} 日先まで作り足し、版を 1 上げる。昨日以前は変えない`, async () => {
    const { child, parent } = await newFamily("topup");
    await ok(
      post("/api/plan/usual-limit", { childId: child.userId, expectedVersion: 0, usualLimitMinutes: 90 }, parent.token),
    );
    const first = snapshotOf(await configGet(child.userId, child.token));
    expect(first.configVersion).toBe(1);
    expect(first.dailyLimits.at(-1)?.date).toBe(addDays("2026-10-15", LIMIT_HORIZON_DAYS));

    // 残りが十分なうち（59 日たっても残り 61 日）は作り足さない。
    // （合言葉は30日使わないと切れるので、20日ごとに取りに来る。子どもの端末は30秒ごとに取りに来る）
    for (const at of ["2026-11-04", "2026-11-24", "2026-12-13"]) {
      clock.set(`${at}T03:00:00Z`);
      expect(await configGet(child.userId, child.token, 1)).toEqual({ changed: false, configVersion: 1 });
    }

    // 70 日後（残り 50 日）: 作り足す
    clock.set("2026-12-24T03:00:00Z");
    const later = snapshotOf(await configGet(child.userId, child.token, 1));
    expect(later.configVersion).toBe(2);
    expect(later.dailyLimits.at(-1)?.date).toBe(addDays("2026-12-24", LIMIT_HORIZON_DAYS));
    // 前に作った日（昨日以前を含む）はそのまま残っている
    expect(later.dailyLimits.slice(0, first.dailyLimits.length)).toEqual(first.dailyLimits);
    // 親から見ても同じ版（反映済み／反映待ちの比べ方がずれない）。親の合言葉は日がたって切れたので、ログインし直す
    const parentAgain = await newPerson("p-topup");
    expect(parentAgain.userId).toBe(parent.userId);
    expect(await versionOf(child.userId, parentAgain.token)).toBe(2);
    // 続けて取りに来ても、もう作り足さない（版が上がり続けない）
    expect(await configGet(child.userId, child.token, 2)).toEqual({ changed: false, configVersion: 2 });
  });

  it("通常上限も計画もない子ども（上限未設定）は、何日たっても版を上げない", async () => {
    const { child } = await newFamily("topup-unset");
    await configGet(child.userId, child.token);
    for (let i = 0; i < 10; i++) {
      clock.addMs(20 * 86_400_000); // 20日ずつ、200日まで（合言葉が切れないように）
      expect(await configGet(child.userId, child.token, 0)).toEqual({ changed: false, configVersion: 0 });
    }
    // 親の合言葉は日がたって切れたので、ログインし直して確かめる
    expect(await versionOf(child.userId, (await newPerson("p-topup-unset")).token)).toBe(0);
  });
});

describe("子どもの「やめる」で QR を取り消す（pairCancel）", () => {
  beforeEach(() => {
    fresh("2026-10-15T03:00:00Z");
  });

  const start = async (token: string) => ok<{ code: string; pairId: string }>(post("/api/pair/start", {}, token));

  it("出したばかりの QR（waiting）を取り消すと expired になり、保護者はもう読めない", async () => {
    const c = await newPerson("cancel-c");
    const p = await newPerson("cancel-p");
    const t = await start(c.token);
    const st = await ok<{ state: string }>(post("/api/pair/cancel", { pairId: t.pairId }, c.token));
    expect(st.state).toBe("expired");
    const claim = await post("/api/pair/claim", { code: t.code }, p.token);
    expect(claim.status).toBe(409);
  });

  it("保護者が読んだ後（claimed）でも取り消せる。子どもはもう確定できず、保護者の照会も expired", async () => {
    const c = await newPerson("cancel-c2");
    const p = await newPerson("cancel-p2");
    const t = await start(c.token);
    await ok(post("/api/pair/claim", { code: t.code }, p.token));
    await ok(post("/api/pair/cancel", { pairId: t.pairId }, c.token));
    expect((await post("/api/pair/confirm", { pairId: t.pairId, accept: true }, c.token)).status).toBe(409);
    expect((await ok<{ state: string }>(post("/api/pair/status", { pairId: t.pairId }, p.token))).state).toBe(
      "expired",
    );
    // つながっていない（役割も決まっていない）
    expect((await ok<{ state: string }>(get("/api/link/status", c.token))).state).toBe("unlinked");
  });

  it("2回呼んでも同じ結果（expired）。もう linked なら取り消せない（409）", async () => {
    const c = await newPerson("cancel-c3");
    const p = await newPerson("cancel-p3");
    const t = await start(c.token);
    await ok(post("/api/pair/cancel", { pairId: t.pairId }, c.token));
    expect((await ok<{ state: string }>(post("/api/pair/cancel", { pairId: t.pairId }, c.token))).state).toBe(
      "expired",
    );
    const t2 = await start(c.token);
    await ok(post("/api/pair/claim", { code: t2.code }, p.token));
    await ok(post("/api/pair/confirm", { pairId: t2.pairId, accept: true }, c.token));
    const res = await post("/api/pair/cancel", { pairId: t2.pairId }, c.token);
    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe("conflict");
  });

  it("取り消せるのは QR を出した子どもだけ（読んだ保護者は 403・関係ない人は 404）", async () => {
    const c = await newPerson("cancel-c4");
    const p = await newPerson("cancel-p4");
    const stranger = await newPerson("cancel-s4");
    const t = await start(c.token);
    await ok(post("/api/pair/claim", { code: t.code }, p.token));
    expect((await post("/api/pair/cancel", { pairId: t.pairId }, p.token)).status).toBe(403);
    expect((await post("/api/pair/cancel", { pairId: t.pairId }, stranger.token)).status).toBe(404);
    expect((await post("/api/pair/cancel", { pairId: t.pairId }, null)).status).toBe(401);
  });
});

describe("対象外アプリの一覧が最後に変わった版と、外したアプリの版（親16 を開き直しても反映の状態が分かる）", () => {
  beforeEach(() => {
    fresh("2026-10-15T03:00:00Z");
  });

  const A = { packageName: "com.example.a", label: "A" };
  const B = { packageName: "com.example.b", label: "B" };

  it("足す・外す・同じ中身で保存・もう一度足す、のそれぞれで appsChangedVersion と removedApps が正しい", async () => {
    const { child, parent } = await newFamily("excluded-ver");
    const childId = child.userId;
    const save = (expectedVersion: number, apps: (typeof A)[]) =>
      ok(post("/api/excluded-apps/save", { childId, expectedVersion, apps }, parent.token));
    const view = () => ok<ExcludedAppsView>(post("/api/excluded-apps/get", { childId }, parent.token));

    expect(await view()).toMatchObject({ appsChangedVersion: 0, removedApps: [], configVersion: 0 });
    await save(0, [A]);
    expect(await view()).toMatchObject({ appsChangedVersion: 1, removedApps: [] });
    await save(1, [A, B]);
    expect(await view()).toMatchObject({ appsChangedVersion: 2 });
    await save(2, [B]); // A を外す
    expect(await view()).toMatchObject({
      appsChangedVersion: 3,
      removedApps: [{ ...A, removedVersion: 3 }],
      apps: [{ ...B, sinceVersion: 2 }],
    });
    await save(3, [B]); // 同じ中身: 版は上がるが、一覧は変わっていない
    expect(await view()).toMatchObject({ configVersion: 4, appsChangedVersion: 3 });
    await save(4, [A, B]); // A をもう一度対象外に
    const v = await view();
    expect(v).toMatchObject({ appsChangedVersion: 5, removedApps: [] });
    expect(v.apps.find((a) => a.packageName === A.packageName)?.sinceVersion).toBe(5);
  });
});
