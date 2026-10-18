// 許可の見張りと親への通告（D-113）のサーバのテスト。
// 確かめること: 送れるのは子ども本人だけ（合言葉の確認は入力の検査より先）・保存（オフになった時刻・最後に届いた時刻・遅れて届いた古い報告）・
//   読めるのは連携している保護者だけ（子ども・連携していない保護者は 403）・連携を外すと消える・設定の版は上がらない。
import { api } from "@contracts/api";
import { mockSessions } from "@contracts/fixtures";
import { beforeEach, describe, expect, it } from "vitest";
import { nextDeviceStatusRow } from "../../backend/src/db/device-status";
import {
  CHILD,
  CHILD_ID,
  clock,
  codeOf,
  fresh,
  link,
  newFamily,
  newPerson,
  ok,
  PARENT,
  post,
  versionOf,
} from "../verify/helpers";

beforeEach(async () => {
  await fresh("2026-10-18T01:00:00Z"); // 日本時間 10:00
});

const allOn = { usageAccess: true, overlay: true, notifications: true, accessibility: true };
const report = (
  token: string | null,
  permissions: unknown,
  measuredAt = new Date().toISOString(),
  childId: string = CHILD_ID,
) => post("/api/device-status/report", { childId, permissions, measuredAt }, token);
const read = (childId: string, token: string | null) => post("/api/device-status/get", { childId }, token);
const readView = async (childId: string, token: string) =>
  api.deviceStatusGet.res.parse(await ok(read(childId, token)));

describe("D-113: 子どもの端末の許可の状態（deviceStatusReport・deviceStatusGet）", () => {
  it("契約: 送るのは子ども（child）、読むのは保護者（parent）", () => {
    expect(api.deviceStatusReport.auth).toBe("child");
    expect(api.deviceStatusGet.auth).toBe("parent");
  });

  it("まだ一度も届いていなければ status: null", async () => {
    expect(await readView(CHILD_ID, PARENT)).toEqual({ status: null });
  });

  it("届いた状態を保存し、オフになった時刻と最後に届いた時刻を返す", async () => {
    const sent = await report(CHILD, allOn);
    expect(sent.status).toBe(200);
    expect(api.deviceStatusReport.res.parse(await sent.json())).toEqual({ ok: true });
    const first = await readView(CHILD_ID, PARENT);
    expect(first.status?.permissions.accessibility).toBe(true);
    expect(first.status?.offSince.accessibility).toBe(null);
    expect(first.status?.lastSeenAt).toBe("2026-10-18T01:00:00.000Z");

    // 10:12 にユーザー補助がオフ
    clock.set("2026-10-18T01:12:00Z");
    await ok(report(CHILD, { ...allOn, accessibility: false }));
    // 10:27 の生存報告（まだオフ）: オフになった時刻は 10:12 のまま、最後に届いた時刻は進む
    clock.set("2026-10-18T01:27:00Z");
    await ok(report(CHILD, { ...allOn, accessibility: false }));
    const off = await readView(CHILD_ID, PARENT);
    expect(off.status?.permissions.accessibility).toBe(false);
    expect(off.status?.offSince.accessibility).toBe("2026-10-18T01:12:00.000Z");
    expect(off.status?.permissions.usageAccess).toBe(true);
    expect(off.status?.offSince.usageAccess).toBe(null);
    expect(off.status?.lastSeenAt).toBe("2026-10-18T01:27:00.000Z");
    expect(off.status?.measuredAt).toBe("2026-10-18T01:27:00.000Z");

    // オンに戻すと offSince は消える。もう一度オフにすると、その時刻から数え直す
    clock.set("2026-10-18T01:30:00Z");
    await ok(report(CHILD, allOn));
    const back = await readView(CHILD_ID, PARENT);
    expect(back.status?.permissions.accessibility).toBe(true);
    expect(back.status?.offSince.accessibility).toBe(null);
    clock.set("2026-10-18T01:40:00Z");
    await ok(report(CHILD, { ...allOn, accessibility: false }));
    expect((await readView(CHILD_ID, PARENT)).status?.offSince.accessibility).toBe("2026-10-18T01:40:00.000Z");
  });

  it("遅れて届いた古い報告は状態を変えず、届いた時刻だけ進める。端末の時計が先に進んでいても今より先にはしない", async () => {
    clock.set("2026-10-18T01:20:00Z");
    await ok(report(CHILD, { ...allOn, overlay: false }));
    clock.set("2026-10-18T01:25:00Z");
    await ok(report(CHILD, allOn, "2026-10-18T01:05:00.000Z")); // 10:05 に測った古い報告
    const view = await readView(CHILD_ID, PARENT);
    expect(view.status?.permissions.overlay).toBe(false);
    expect(view.status?.offSince.overlay).toBe("2026-10-18T01:20:00.000Z");
    expect(view.status?.lastSeenAt).toBe("2026-10-18T01:25:00.000Z");

    // 端末の時計が 1 時間進んでいる
    clock.set("2026-10-18T01:30:00Z");
    await ok(report(CHILD, { ...allOn, usageAccess: false }, "2026-10-18T02:30:00.000Z"));
    const ahead = await readView(CHILD_ID, PARENT);
    expect(ahead.status?.offSince.usageAccess).toBe("2026-10-18T01:30:00.000Z");
    expect(ahead.status?.measuredAt).toBe("2026-10-18T01:30:00.000Z");
  });

  it("送れるのは子どもだけ。保護者・紐づけ前の人は 403、合言葉なし・無効は 401（形の違う入力でも先に 401）", async () => {
    expect((await report(PARENT, allOn)).status).toBe(403);
    expect((await report(mockSessions["mock-google-new"].token, allOn)).status).toBe(403);
    expect((await report(null, allOn)).status).toBe(401);
    expect((await report("no-such-token", allOn)).status).toBe(401);
    const res = await post("/api/device-status/report", "not-an-object", null);
    expect(res.status).toBe(401);
  });

  it("形の違う入力は bad_request（許可が足りない・真偽でない・時刻でない・childId がない）", async () => {
    const bad = [
      {
        childId: CHILD_ID,
        permissions: { usageAccess: true, overlay: true, notifications: true },
        measuredAt: new Date().toISOString(),
      },
      { childId: CHILD_ID, permissions: { ...allOn, overlay: "yes" }, measuredAt: new Date().toISOString() },
      { childId: CHILD_ID, permissions: allOn, measuredAt: "abc" },
      { childId: CHILD_ID, permissions: allOn },
      { permissions: allOn, measuredAt: new Date().toISOString() },
    ];
    for (const body of bad) {
      const res = await post("/api/device-status/report", body, CHILD);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(await codeOf(res)).toBe("bad_request");
    }
  });

  it("送れるのは自分の childId だけ。ほかの子どもの childId は 403 で、どこにも保存しない", async () => {
    const other = await newFamily("ds-other");
    const res = await report(CHILD, allOn, new Date().toISOString(), other.child.userId);
    expect(res.status).toBe(403);
    expect((await readView(other.child.userId, other.parent.token)).status).toBeNull();
    expect((await readView(CHILD_ID, PARENT)).status).toBeNull();
  });

  it("読めるのは連携している保護者だけ。子どもは自分の分でも 403、連携していない子どもは 403", async () => {
    await ok(report(CHILD, allOn));
    expect((await read(CHILD_ID, CHILD)).status).toBe(403);
    const other = await newFamily("ds-p");
    expect((await read(CHILD_ID, other.parent.token)).status).toBe(403);
    expect((await read(other.child.userId, PARENT)).status).toBe(403);
    const stranger = await newPerson("ds-stranger");
    expect((await read(stranger.userId, PARENT)).status).toBe(403);
    expect((await read("not-a-uuid", PARENT)).status).toBe(403);
  });

  it("連携を外すと消える（次に紐づけた保護者に前の様子を見せない）", async () => {
    const { child, parent } = await newFamily("ds-unlink");
    await ok(report(child.token, { ...allOn, accessibility: false }, undefined, child.userId));
    expect((await readView(child.userId, parent.token)).status).not.toBeNull();
    await ok(post("/api/family/unlink", { childId: child.userId }, parent.token));
    // 子どもの合言葉は無効になる（端末の Kotlin は 401 を受けて送るのをやめる）
    expect((await report(child.token, allOn, undefined, child.userId)).status).toBe(401);
    const again = await newPerson("c-ds-unlink");
    const parent2 = await newPerson("p2-ds-unlink");
    await link(again.token, parent2.token);
    expect((await readView(child.userId, parent2.token)).status).toBeNull();
  });

  it("送っても設定の版は上がらない（親の設定ではないので「反映待ち」にならない）", async () => {
    const before = await versionOf(CHILD_ID, PARENT);
    await ok(report(CHILD, { ...allOn, notifications: false }));
    expect(await versionOf(CHILD_ID, PARENT)).toBe(before);
  });
});

describe("nextDeviceStatusRow（保存する行の作り方）", () => {
  const base = {
    childId: "c",
    permissions: allOn,
    measuredAt: new Date("2026-10-18T01:00:00Z"),
    receivedAt: new Date("2026-10-18T01:00:01Z"),
  };

  it("初めての報告: オフの許可は測った時刻からオフ", () => {
    const row = nextDeviceStatusRow(null, { ...base, permissions: { ...allOn, notifications: false } });
    expect(row.notificationsOffSince).toEqual(base.measuredAt);
    expect(row.usageAccessOffSince).toBeNull();
    expect(row.lastSeenAt).toEqual(base.receivedAt);
  });

  it("届いた時刻は戻さない", () => {
    const prev = nextDeviceStatusRow(null, base);
    const later = nextDeviceStatusRow(prev, {
      ...base,
      measuredAt: new Date("2026-10-18T01:05:00Z"),
      receivedAt: new Date("2026-10-18T00:59:00Z"),
    });
    expect(later.lastSeenAt).toEqual(base.receivedAt);
    expect(later.measuredAt).toEqual(new Date("2026-10-18T01:05:00Z"));
  });
});
