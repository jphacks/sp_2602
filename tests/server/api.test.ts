// サーバの API が契約どおりに応答するかのテスト。サーバは Hono の app.request で、本物のネットワークを使わずに呼ぶ。
// 状態はメモリ上の store（src/server/mock/store.ts）。テストごとに時計を固定した新しい store に入れ替える（MOCK=1 なのでデモの3人つき）。
// 確かめること: auth の 401/403・子どもは自分だけ・親は連携済みの子どもだけ・ペアリングの状態の進み方と失敗（期限切れ・使用済み・二重読取・
// 親1↔子1）・計画と空白期間・C8 の重複防止・C9 は親だけ・C7 の版・エラーの形・ストリームの仕組み。
import { api, type StreamDef, streamLine } from "@contracts/api";
import { ApiError } from "@contracts/errors";
import { mockPair, mockSessions } from "@contracts/fixtures";
import { ConfigResult, PairState, PairStatus, PairTicket, Session } from "@contracts/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import app from "@/server/app";
import { AppError } from "@/server/errors";
import { PAIR_TTL_MS, resetStore } from "@/server/mock/store";
import { handle, streamHandler } from "@/server/route";

// 合言葉（MOCK=1 の mockSessions）
const PARENT = mockSessions["mock-google-parent"].token;
const CHILD = mockSessions["mock-google-child"].token;
const NEW = mockSessions["mock-google-new"].token;
const CHILD_ID = mockSessions["mock-google-child"].userId;

// 時計（日本時間 2026-10-15 12:00）。テストの中で進められる
let nowMs = Date.parse("2026-10-15T03:00:00Z");
const TODAY = "2026-10-15";

beforeEach(() => {
  nowMs = Date.parse("2026-10-15T03:00:00Z");
  resetStore({ seed: true, now: () => new Date(nowMs) });
});

const auth = (token: string | null): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});
const post = (path: string, body: unknown, token: string | null) =>
  app.request(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...auth(token) },
  });
const get = (path: string, token: string | null) => app.request(path, { headers: auth(token) });
const codeOf = async (res: Response) => ApiError.parse(await res.json()).code;

// MOCK のログインで「はじめての人」を作る（"mock-" + 好きな文字）
async function newPerson(suffix: string): Promise<Session> {
  const res = await post("/api/auth/google", { idToken: `mock-new-${suffix}` }, null);
  return Session.parse(await res.json());
}

// 2人の「はじめての人」を QR で紐づける（childToken が QR を出し、parentToken が読む）
async function link(childToken: string, parentToken: string) {
  const ticket = PairTicket.parse(await (await post("/api/pair/start", {}, childToken)).json());
  const claimed = await post("/api/pair/claim", { code: ticket.code }, parentToken);
  expect(claimed.status).toBe(200);
  const confirmed = PairStatus.parse(
    await (await post("/api/pair/confirm", { pairId: ticket.pairId, accept: true }, childToken)).json(),
  );
  return { ticket, confirmed };
}

describe("契約と入口", () => {
  it("health は契約どおり", async () => {
    const res = await app.request("/api/health");
    expect(api.health.res.safeParse(await res.json()).success).toBe(true);
  });

  it("契約のすべての API が app につながっている（404 にならない）", async () => {
    for (const route of Object.values(api)) {
      const res = route.method === "GET" ? await get(route.path, PARENT) : await post(route.path, {}, PARENT);
      expect(res.status, `${route.method} ${route.path}`).not.toBe(404);
    }
  });

  it("契約にない道筋は 404 + ApiError(not_found)", async () => {
    const res = await app.request("/api/nothing");
    expect(res.status).toBe(404);
    expect(await codeOf(res)).toBe("not_found");
  });

  it("契約のすべての API に auth がある", () => {
    for (const [name, route] of Object.entries(api))
      expect(["none", "signedIn", "parent", "child"], `${name} の auth`).toContain(route.auth);
  });

  it("子どもの端末のアプリ一覧を送る API はない（Q15 保留）", () => {
    expect(Object.keys(api).some((k) => /installed/i.test(k))).toBe(false);
  });
});

describe("ログインと合言葉（C1）", () => {
  it("authGoogle は MOCK の idToken から合言葉つきの Session を返す", async () => {
    const res = await post("/api/auth/google", { idToken: "mock-google-parent" }, null);
    expect(api.authGoogle.res.parse(await res.json())).toEqual(mockSessions["mock-google-parent"]);
  });

  it("authGoogle は知らない（JWT でない）idToken を 401 にする", async () => {
    const res = await post("/api/auth/google", { idToken: "nobody" }, null);
    expect(res.status).toBe(401);
    expect(await codeOf(res)).toBe("unauthorized");
  });

  it("MOCK=1 でなければ mock- の idToken は受け付けない", async () => {
    const before = process.env.MOCK;
    process.env.MOCK = "0";
    try {
      const res = await post("/api/auth/google", { idToken: "mock-google-parent" }, null);
      expect(res.status).toBe(401);
    } finally {
      process.env.MOCK = before;
    }
  });

  it("別の mock- の idToken は、それぞれ別の「はじめての人」になる（2台で紐づけを試すため）", async () => {
    const a = await newPerson("a");
    const b = await newPerson("b");
    expect(a.userId).not.toBe(b.userId);
    expect([a.role, b.role]).toEqual([null, null]);
  });

  it("authMe は合言葉の持ち主を返す。紐づけ前の人は role が null", async () => {
    const me = api.authMe.res.parse(await (await get("/api/auth/me", NEW)).json());
    expect(me.userId).toBe("demo-new");
    expect(me.role).toBeNull();
  });

  it("合言葉なし・でたらめな合言葉は 401", async () => {
    const none = await post("/api/plan/get", { childId: CHILD_ID }, null);
    const bad = await post("/api/plan/get", { childId: CHILD_ID }, "not-a-token");
    expect([none.status, bad.status]).toEqual([401, 401]);
  });

  it("合言葉の確認は入力の検査より先（ログインしていない人に入力の詳細を返さない）", async () => {
    const res = await post("/api/plan/get", { childId: "" }, null);
    expect(res.status).toBe(401);
  });

  it("30日使われなかった合言葉は無効になる", async () => {
    nowMs += 31 * 86_400_000;
    expect((await get("/api/auth/me", PARENT)).status).toBe(401);
  });
});

describe("役割と子どもの範囲（auth と D2）", () => {
  it("子どもの合言葉で保護者の操作（計画の保存・対象外アプリの保存・空白期間）は 403", async () => {
    const plan = await post(
      "/api/plan/save",
      { childId: CHILD_ID, expectedVersion: 0, planStartDate: TODAY, startLimitMinutes: 100, finalGoalMinutes: 50 },
      CHILD,
    );
    const apps = await post("/api/excluded-apps/save", { childId: CHILD_ID, expectedVersion: 0, apps: [] }, CHILD);
    const blank = await post("/api/blank-period/list", { childId: CHILD_ID }, CHILD);
    expect([plan.status, apps.status, blank.status]).toEqual([403, 403, 403]);
  });

  it("保護者の合言葉で利用記録を送ると 403（子どもの端末だけが送れる）", async () => {
    const res = await post(
      "/api/usage/upload",
      { submissionId: crypto.randomUUID(), childId: CHILD_ID, days: [] },
      PARENT,
    );
    expect(res.status).toBe(403);
  });

  it("子どもは自分の childId を読める。ほかの childId は 403（読む・送るのどちらも）", async () => {
    expect((await post("/api/plan/get", { childId: CHILD_ID }, CHILD)).status).toBe(200);
    const other = "someone-else";
    const read = await post("/api/config/get", { childId: other }, CHILD);
    const send = await post(
      "/api/usage/upload",
      {
        submissionId: crypto.randomUUID(),
        childId: other,
        days: [{ date: TODAY, measuredAt: "2026-10-15T03:00:00.000Z", restrictedMinutes: 1, apps: [] }],
      },
      CHILD,
    );
    expect([read.status, send.status]).toEqual([403, 403]);
    expect(await codeOf(read)).toBe("forbidden");
  });

  it("保護者は連携済みの子どもだけを見られる。連携していない子どもは 403", async () => {
    expect((await post("/api/usage/get", { childId: CHILD_ID, from: TODAY, to: TODAY }, PARENT)).status).toBe(200);
    const stranger = await newPerson("stranger");
    const res = await post("/api/usage/get", { childId: stranger.userId, from: TODAY, to: TODAY }, PARENT);
    expect(res.status).toBe(403);
  });

  it("紐づけ前の人（role: null）は、どの子どもの情報も扱えない（403）", async () => {
    const res = await post("/api/test-period/list", { childId: CHILD_ID }, NEW);
    expect(res.status).toBe(403);
  });

  it("子どもは家族の一覧（familyGet）を見られない（403）", async () => {
    expect((await get("/api/family/get", CHILD)).status).toBe(403);
  });
});

describe("QR の紐づけ（C1・Q2・Q10）", () => {
  it("MOCK の例が、ペアリングのすべての状態をそろえている", () => {
    const states = Object.values(mockPair).flatMap((v) => ("state" in v ? [v.state] : []));
    expect([...new Set(states)].sort()).toEqual([...PairState.options].sort());
  });

  it("waiting → claimed → linked と進み、linked で役割と D2 のつながりが決まる", async () => {
    const child = await newPerson("c1");
    const parent = await newPerson("p1");
    const ticket = PairTicket.parse(await (await post("/api/pair/start", {}, child.token)).json());
    for (const s of Object.values(mockSessions)) expect(ticket.code).not.toContain(s.token); // QR に合言葉を入れない
    const waiting = PairStatus.parse(
      await (await post("/api/pair/status", { pairId: ticket.pairId }, child.token)).json(),
    );
    expect(waiting.state).toBe("waiting");
    const claimed = PairStatus.parse(await (await post("/api/pair/claim", { code: ticket.code }, parent.token)).json());
    expect(claimed.state).toBe("claimed");
    expect(claimed.parentName).toBe(parent.name);
    // 確定の前は、まだ役割も連携もない
    expect((await (await get("/api/auth/me", child.token)).json()).role).toBeNull();
    const linked = PairStatus.parse(
      await (await post("/api/pair/confirm", { pairId: ticket.pairId, accept: true }, child.token)).json(),
    );
    expect(linked.state).toBe("linked");
    expect((await (await get("/api/auth/me", child.token)).json()).role).toBe("child");
    expect((await (await get("/api/auth/me", parent.token)).json()).role).toBe("parent");
    const status = api.linkStatus.res.parse(await (await get("/api/link/status", parent.token)).json());
    expect(status).toEqual({
      state: "linked",
      role: "parent",
      partners: [{ userId: child.userId, name: child.name, role: "child" }],
    });
    // 保護者の画面から、その子どもの情報が見られるようになる
    expect((await post("/api/plan/get", { childId: child.userId }, parent.token)).status).toBe(200);
  });

  it("子どもが「いいえ」なら rejected で、連携しない", async () => {
    const child = await newPerson("c2");
    const parent = await newPerson("p2");
    const ticket = PairTicket.parse(await (await post("/api/pair/start", {}, child.token)).json());
    await post("/api/pair/claim", { code: ticket.code }, parent.token);
    const res = PairStatus.parse(
      await (await post("/api/pair/confirm", { pairId: ticket.pairId, accept: false }, child.token)).json(),
    );
    expect(res.state).toBe("rejected");
    expect((await (await get("/api/link/status", parent.token)).json()).state).toBe("unlinked");
  });

  it("10分たった QR は期限切れ（読み取りは conflict、進み具合は expired）", async () => {
    const child = await newPerson("c3");
    const parent = await newPerson("p3");
    const ticket = PairTicket.parse(await (await post("/api/pair/start", {}, child.token)).json());
    nowMs += PAIR_TTL_MS + 1000;
    const claim = await post("/api/pair/claim", { code: ticket.code }, parent.token);
    expect(claim.status).toBe(409);
    const status = PairStatus.parse(
      await (await post("/api/pair/status", { pairId: ticket.pairId }, child.token)).json(),
    );
    expect(status.state).toBe("expired");
  });

  it("同じ QR を2回読む（二重読取）と、2回目は使用済みの conflict", async () => {
    const child = await newPerson("c4");
    const p1 = await newPerson("p4");
    const p2 = await newPerson("p5");
    const ticket = PairTicket.parse(await (await post("/api/pair/start", {}, child.token)).json());
    expect((await post("/api/pair/claim", { code: ticket.code }, p1.token)).status).toBe(200);
    const second = await post("/api/pair/claim", { code: ticket.code }, p2.token);
    expect(second.status).toBe(409);
    // 確定した後にもう一度読んでも使えない（使用済み）
    await post("/api/pair/confirm", { pairId: ticket.pairId, accept: true }, child.token);
    expect((await post("/api/pair/claim", { code: ticket.code }, p2.token)).status).toBe(409);
  });

  it("QR を出し直すと前の QR は無効になる", async () => {
    const child = await newPerson("c6");
    const parent = await newPerson("p6");
    const first = PairTicket.parse(await (await post("/api/pair/start", {}, child.token)).json());
    await post("/api/pair/start", {}, child.token);
    expect((await post("/api/pair/claim", { code: first.code }, parent.token)).status).toBe(409);
  });

  it("知らない番号は not_found。自分の QR は読めない。子どもは読めない（403）", async () => {
    const child = await newPerson("c7");
    const ticket = PairTicket.parse(await (await post("/api/pair/start", {}, child.token)).json());
    expect((await post("/api/pair/claim", { code: "no-such-code" }, NEW)).status).toBe(404);
    expect((await post("/api/pair/claim", { code: ticket.code }, child.token)).status).toBe(409);
    expect((await post("/api/pair/claim", { code: ticket.code }, CHILD)).status).toBe(403);
  });

  it("保護者は QR を出せない（conflict）", async () => {
    expect((await post("/api/pair/start", {}, PARENT)).status).toBe(409);
  });

  it("親1人↔子1人: 連携済みの保護者が2人目の子どもを読むと conflict、連携済みの子どもは QR を出せない", async () => {
    const child = await newPerson("c8");
    const ticket = PairTicket.parse(await (await post("/api/pair/start", {}, child.token)).json());
    expect((await post("/api/pair/claim", { code: ticket.code }, PARENT)).status).toBe(409);
    expect((await post("/api/pair/start", {}, CHILD)).status).toBe(409);
  });

  it("確定は QR を出した子どもだけ（保護者は 403）。関わっていないペアリングは not_found", async () => {
    const child = await newPerson("c9");
    const parent = await newPerson("p9");
    const ticket = PairTicket.parse(await (await post("/api/pair/start", {}, child.token)).json());
    await post("/api/pair/claim", { code: ticket.code }, parent.token);
    expect((await post("/api/pair/confirm", { pairId: ticket.pairId, accept: true }, parent.token)).status).toBe(403);
    expect((await post("/api/pair/status", { pairId: ticket.pairId }, NEW)).status).toBe(404);
  });

  it("保護者が読む前の確定は conflict（まだ waiting）", async () => {
    const child = await newPerson("c10");
    const ticket = PairTicket.parse(await (await post("/api/pair/start", {}, child.token)).json());
    expect((await post("/api/pair/confirm", { pairId: ticket.pairId, accept: true }, child.token)).status).toBe(409);
  });
});

describe("通常上限・計画・空白期間（D8・Q7・Q14）と C7", () => {
  async function config(token: string, childId: string, knownVersion?: number) {
    return ConfigResult.parse(await (await post("/api/config/get", { childId, knownVersion }, token)).json());
  }

  it("紐づけ直後は上限未設定。通常上限を決めると、今日から先が通常上限になる", async () => {
    const child = await newPerson("c20");
    const parent = await newPerson("p20");
    await link(child.token, parent.token);
    const before = await config(child.token, child.userId);
    if (!before.changed) throw new Error("changed のはず");
    expect(before.snapshot.dailyLimits).toEqual([]);
    expect(before.snapshot.usualLimitMinutes).toBeNull();
    const saved = await post(
      "/api/plan/usual-limit",
      { childId: child.userId, expectedVersion: before.snapshot.configVersion, usualLimitMinutes: 90 },
      parent.token,
    );
    expect(saved.status).toBe(200);
    const after = await config(child.token, child.userId);
    if (!after.changed) throw new Error("changed のはず");
    expect(after.snapshot.dailyLimits[0]).toEqual({ date: TODAY, kind: "limited", limitMinutes: 90 });
  });

  it("計画は G > S と、今日より前の開始日を断る（bad_request）", async () => {
    const v = (await (await post("/api/plan/get", { childId: CHILD_ID }, PARENT)).json()).configVersion;
    const gOver = await post(
      "/api/plan/save",
      { childId: CHILD_ID, expectedVersion: v, planStartDate: TODAY, startLimitMinutes: 60, finalGoalMinutes: 90 },
      PARENT,
    );
    const past = await post(
      "/api/plan/save",
      {
        childId: CHILD_ID,
        expectedVersion: v,
        planStartDate: "2026-10-14",
        startLimitMinutes: 90,
        finalGoalMinutes: 60,
      },
      PARENT,
    );
    expect([gOver.status, past.status]).toEqual([400, 400]);
  });

  it("版がずれた保存は conflict。保存すると版が1つ上がる（Q6）", async () => {
    const view = api.planGet.res.parse(await (await post("/api/plan/get", { childId: CHILD_ID }, PARENT)).json());
    const body = {
      childId: CHILD_ID,
      planStartDate: TODAY,
      startLimitMinutes: 240,
      finalGoalMinutes: 60,
    };
    const stale = await post("/api/plan/save", { ...body, expectedVersion: view.configVersion - 1 }, PARENT);
    expect(stale.status).toBe(409);
    const ok = api.planSave.res.parse(
      await (await post("/api/plan/save", { ...body, expectedVersion: view.configVersion }, PARENT)).json(),
    );
    expect(ok.configVersion).toBe(view.configVersion + 1);
  });

  it("空白期間の日は「制限なし」（0 分とも未設定とも違う）。消すと元の上限に戻る", async () => {
    const v0 = (await (await post("/api/blank-period/list", { childId: CHILD_ID }, PARENT)).json()).configVersion;
    const created = api.blankPeriodCreate.res.parse(
      await (
        await post(
          "/api/blank-period/create",
          { childId: CHILD_ID, expectedVersion: v0, name: "秋休み", startDate: "2026-10-16", endDate: "2026-10-17" },
          PARENT,
        )
      ).json(),
    );
    const snap = await config(CHILD, CHILD_ID);
    if (!snap.changed) throw new Error("changed のはず");
    const day = (d: string) => snap.snapshot.dailyLimits.find((l) => l.date === d);
    expect(day("2026-10-16")).toEqual({ date: "2026-10-16", kind: "unlimited", blankPeriodId: created.blankPeriod.id });
    expect(day("2026-10-18")?.kind).toBe("limited");
    await post(
      "/api/blank-period/delete",
      { childId: CHILD_ID, expectedVersion: created.configVersion, id: created.blankPeriod.id },
      PARENT,
    );
    const after = await config(CHILD, CHILD_ID);
    if (!after.changed) throw new Error("changed のはず");
    expect(after.snapshot.dailyLimits.find((l) => l.date === "2026-10-16")?.kind).toBe("limited");
  });

  it("子どももテスト期間を足せる（作った人が残る。Q11）。重なる期間は bad_request", async () => {
    const list = api.testPeriodList.res.parse(
      await (await post("/api/test-period/list", { childId: CHILD_ID }, CHILD)).json(),
    );
    const res = await post(
      "/api/test-period/create",
      {
        childId: CHILD_ID,
        expectedVersion: list.configVersion,
        name: "英語",
        startDate: "2026-11-10",
        endDate: "2026-11-11",
      },
      CHILD,
    );
    const saved = api.testPeriodCreate.res.parse(await res.json());
    expect(saved.testPeriod.createdByRole).toBe("child");
    expect(saved.testPeriod.createdByUserId).toBe(CHILD_ID);
    const overlap = await post(
      "/api/test-period/create",
      {
        childId: CHILD_ID,
        expectedVersion: saved.configVersion,
        name: "国語",
        startDate: "2026-11-11",
        endDate: "2026-11-12",
      },
      CHILD,
    );
    expect(overlap.status).toBe(400);
    // 失敗した保存は版を上げない（前の正式な版を保つ）
    const after = api.testPeriodList.res.parse(
      await (await post("/api/test-period/list", { childId: CHILD_ID }, CHILD)).json(),
    );
    expect(after.configVersion).toBe(saved.configVersion);
  });

  it("C7: 同じ版なら中身を省く。子どもが送った版は「子どもが使っている版」として親に見える（Q6）", async () => {
    const first = await config(CHILD, CHILD_ID);
    if (!first.changed) throw new Error("changed のはず");
    const v = first.snapshot.configVersion;
    expect(await config(CHILD, CHILD_ID, v)).toEqual({ changed: false, configVersion: v });
    const view = api.excludedAppsGet.res.parse(
      await (await post("/api/excluded-apps/get", { childId: CHILD_ID }, PARENT)).json(),
    );
    expect(view.childAppliedVersion).toBe(v);
    // 親が変えると版が上がり、子どもが取りに来るまで「反映待ち」
    await post(
      "/api/excluded-apps/save",
      { childId: CHILD_ID, expectedVersion: v, apps: [{ packageName: "com.example.game", label: "ゲーム" }] },
      PARENT,
    );
    const pending = api.excludedAppsGet.res.parse(
      await (await post("/api/excluded-apps/get", { childId: CHILD_ID }, PARENT)).json(),
    );
    expect(pending.configVersion).toBe(v + 1);
    expect(pending.childAppliedVersion).toBe(v);
  });
});

describe("C9: 対象外アプリ", () => {
  it("保護者だけが保存できる。子どもは閲覧だけ（保存は 403）", async () => {
    const view = api.excludedAppsGet.res.parse(
      await (await post("/api/excluded-apps/get", { childId: CHILD_ID }, CHILD)).json(),
    );
    const body = { childId: CHILD_ID, expectedVersion: view.configVersion, apps: [] };
    expect((await post("/api/excluded-apps/save", body, CHILD)).status).toBe(403);
    expect((await post("/api/excluded-apps/save", body, PARENT)).status).toBe(200);
  });
});

describe("C8: 利用記録", () => {
  const day = (date: string, measuredAt: string, minutes: number) => ({
    date,
    measuredAt,
    restrictedMinutes: minutes,
    apps: [{ packageName: "com.google.android.youtube", label: "YouTube", usedMinutes: minutes, excluded: false }],
  });

  it("同じ送信 ID の送り直しは二重に保存しない（duplicate）。中身が違えば conflict", async () => {
    const submissionId = crypto.randomUUID();
    const body = { submissionId, childId: CHILD_ID, days: [day(TODAY, "2026-10-15T02:00:00.000Z", 30)] };
    const first = api.usageUpload.res.parse(await (await post("/api/usage/upload", body, CHILD)).json());
    const again = api.usageUpload.res.parse(await (await post("/api/usage/upload", body, CHILD)).json());
    expect(first.status).toBe("accepted");
    expect(again.status).toBe("duplicate");
    const changed = await post(
      "/api/usage/upload",
      { ...body, days: [day(TODAY, "2026-10-15T02:00:00.000Z", 31)] },
      CHILD,
    );
    expect(changed.status).toBe(409);
  });

  it("日ごとに、測った時刻が一番新しい記録を正とする（古い記録が後から届いても上書きしない）", async () => {
    await post(
      "/api/usage/upload",
      { submissionId: crypto.randomUUID(), childId: CHILD_ID, days: [day(TODAY, "2026-10-15T03:00:00.000Z", 50)] },
      CHILD,
    );
    const old = api.usageUpload.res.parse(
      await (
        await post(
          "/api/usage/upload",
          { submissionId: crypto.randomUUID(), childId: CHILD_ID, days: [day(TODAY, "2026-10-15T01:00:00.000Z", 10)] },
          CHILD,
        )
      ).json(),
    );
    expect(old.appliedDates).toEqual([]);
    const view = api.usageGet.res.parse(
      await (await post("/api/usage/get", { childId: CHILD_ID, from: TODAY, to: TODAY }, PARENT)).json(),
    );
    expect(view.days[0]?.usedMinutes).toBe(50);
  });

  it("C6: 記録がない日は recorded: false（0 分と区別）。上限の値も一緒に返す", async () => {
    const view = api.usageGet.res.parse(
      await (await post("/api/usage/get", { childId: CHILD_ID, from: "2026-10-14", to: TODAY }, PARENT)).json(),
    );
    const [yesterday, today] = view.days;
    expect(yesterday?.recorded).toBe(true); // 見本の記録がある
    expect(today).toMatchObject({ recorded: false, usedMinutes: null });
    expect(today?.limit?.kind).toBe("limited");
  });
});

describe("エラーの契約", () => {
  const planGet = (token: string | null = PARENT) =>
    new Request("http://test/api", {
      method: "POST",
      body: JSON.stringify({ childId: CHILD_ID }),
      headers: { "Content-Type": "application/json", ...auth(token) },
    });

  it("契約外の入力は 400 + ApiError(bad_request)（issues つき）", async () => {
    const res = await post("/api/plan/get", { childId: "" }, PARENT);
    expect(res.status).toBe(400);
    const body = ApiError.parse(await res.json());
    expect(body.code).toBe("bad_request");
    expect(body.issues?.length).toBeGreaterThan(0);
  });

  it("AppError は対応するステータスと ApiError になる", async () => {
    const failing = handle("planGet", async () => {
      throw new AppError("upstream_failed");
    });
    const res = await failing(planGet());
    expect(res.status).toBe(502);
    expect(await codeOf(res)).toBe("upstream_failed");
  });

  it("想定外の例外は internal（中身は漏らさない）", async () => {
    const failing = handle("planGet", async () => {
      throw new Error("secret detail");
    });
    const res = await failing(planGet());
    const body = ApiError.parse(await res.json());
    expect(res.status).toBe(500);
    expect(body.code).toBe("internal");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("サーバで network を投げても落ちず upstream_failed(502) になる", async () => {
    const failing = handle("planGet", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: 型で禁止しているコードを無理に渡す場合の検査
      throw new AppError("network" as any);
    });
    const res = await failing(planGet());
    expect(res.status).toBe(502);
  });

  it("出力が契約と合わないのはサーバの不具合（internal）", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: 契約と違う出力をわざと返す
    const broken = handle("planGet", async () => ({ wrong: true }) as any);
    const res = await broken(planGet());
    expect(res.status).toBe(500);
  });
});

// ストリームの仕組み（今はストリームの API がないので、契約の表にない StreamDef で確かめる）
describe("ストリームの仕組み", () => {
  const def: StreamDef = {
    kind: "stream",
    method: "POST",
    path: "/test/stream",
    auth: "signedIn",
    req: z.object({ childId: z.string().min(1) }),
    chunk: z.object({ text: z.string() }),
    res: z.object({ done: z.boolean() }),
  };
  const req = (body: unknown, token: string | null) =>
    new Request("http://test/stream", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...auth(token) },
    });

  it("1行ずつ chunk → 最後に done が契約どおりに届く", async () => {
    const route = streamHandler(def, async (_req, emit) => {
      emit({ text: "1" });
      emit({ text: "2" });
      return { done: true };
    });
    const res = await route(req({ childId: CHILD_ID }, CHILD));
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const schema = streamLine(def.chunk, def.res);
    for (const l of lines) expect(schema.safeParse(l).success).toBe(true);
    expect(lines.map((l) => l.type)).toEqual(["chunk", "chunk", "done"]);
  });

  it("流し始める前に auth と子どもの範囲を確かめる（ほかの子どもは 403。200 のまま途中で失敗しない）", async () => {
    const route = streamHandler(def, async () => ({ done: true }));
    expect((await route(req({ childId: CHILD_ID }, null))).status).toBe(401);
    expect((await route(req({ childId: "someone-else" }, CHILD))).status).toBe(403);
  });

  it("アプリが読むのをやめたら、処理に渡した signal も止まり、その後は書かない", async () => {
    let seen: AbortSignal | undefined;
    let finished = () => {};
    const ended = new Promise<void>((r) => {
      finished = r;
    });
    const route = streamHandler(def, async (_req, emit, signal) => {
      seen = signal;
      emit({ text: "1" });
      await new Promise((r) => setTimeout(r, 20));
      emit({ text: "2" }); // 中断の後。閉じたストリームに書いて例外にならないこと
      finished();
      return { done: true };
    });
    const res = await route(req({ childId: CHILD_ID }, CHILD));
    const reader = res.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    await ended;
    expect(seen?.aborted).toBe(true);
  });
});
