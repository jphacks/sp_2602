// 確かめ役（V）: 安全面の点検（MVP_SPEC 4.1・6章、AC-03・AC-04・AC-13）。
//   - 子どもは保護者の操作・ほかの子どもの操作ができない
//   - 保護者は連携していない子どものデータを読めない・変えられない
//   - QR の code に合言葉・個人情報が入らない
//   - エラーに例外の文（中身）が漏れない
//   - 版のずれ（expectedVersion）は conflict で、何も変えない
//   - 送信 ID の重複は二重に保存しない。ほかの子どもと同じ送信 ID でも中身は漏れない
import { api } from "@contracts/api";
import { mockSessions } from "@contracts/fixtures";
import { PairTicket } from "@contracts/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CHILD,
  CHILD_ID,
  clock,
  codeOf,
  fresh,
  get,
  NEW,
  newFamily,
  newPerson,
  ok,
  PARENT,
  post,
  postRaw,
  versionOf,
} from "./helpers";

const TODAY = "2026-10-15";

beforeEach(() => {
  fresh("2026-10-15T03:00:00Z");
});

const period = { name: "テスト", startDate: "2026-11-01", endDate: "2026-11-02" };
const plan = { planStartDate: TODAY, startLimitMinutes: 200, finalGoalMinutes: 100 };
const day = (date: string, measuredAt: string, minutes: number) => ({
  date,
  measuredAt,
  restrictedMinutes: minutes,
  apps: [{ packageName: "com.example.game", label: "ゲーム", usedMinutes: minutes, excluded: false }],
});

// childId を入れて、親子どちらかが呼べる API の本文（版は呼ぶ前に入れる）
const childBodies = (childId: string, v: number) => ({
  "/api/plan/get": { childId },
  "/api/plan/save": { childId, expectedVersion: v, ...plan },
  "/api/plan/usual-limit": { childId, expectedVersion: v, usualLimitMinutes: 60 },
  "/api/test-period/list": { childId },
  "/api/test-period/create": { childId, expectedVersion: v, ...period },
  "/api/test-period/update": { childId, expectedVersion: v, id: "x", ...period },
  "/api/test-period/delete": { childId, expectedVersion: v, id: "x" },
  "/api/blank-period/list": { childId },
  "/api/blank-period/create": { childId, expectedVersion: v, ...period },
  "/api/blank-period/update": { childId, expectedVersion: v, id: "x", ...period },
  "/api/blank-period/delete": { childId, expectedVersion: v, id: "x" },
  "/api/config/get": { childId },
  "/api/usage/get": { childId, from: TODAY, to: TODAY },
  "/api/excluded-apps/get": { childId },
  "/api/excluded-apps/save": { childId, expectedVersion: v, apps: [] },
  "/api/usage/upload": {
    submissionId: crypto.randomUUID(),
    childId,
    days: [day(TODAY, "2026-10-15T02:00:00.000Z", 5)],
  },
});

describe("V: 子どもが保護者の操作・ほかの子どもの操作をできない（AC-04）", () => {
  it("子どもの合言葉で保護者だけの操作は、自分の childId でもすべて 403", async () => {
    const v = await versionOf(CHILD_ID, PARENT);
    const parentOnly = Object.entries(api)
      .filter(([, r]) => r.auth === "parent")
      .map(([, r]) => r.path);
    const bodies = childBodies(CHILD_ID, v) as Record<string, unknown>;
    for (const path of parentOnly) {
      const res = path === "/api/family/get" ? await get(path, CHILD) : await post(path, bodies[path], CHILD);
      expect(res.status, path).toBe(403);
      expect(await codeOf(res), path).toBe("forbidden");
    }
    // 何も変わっていない（版が同じ）
    expect(await versionOf(CHILD_ID, PARENT)).toBe(v);
  });

  it("子どもは、ほかの子どもの childId では、読む・書く・送るのどれも 403", async () => {
    const { child: other, parent: otherParent } = await newFamily("other");
    const v = await versionOf(other.userId, otherParent.token);
    const bodies = childBodies(other.userId, v);
    for (const [path, body] of Object.entries(bodies)) {
      const res = await post(path, body, CHILD);
      expect(res.status, path).toBe(403);
    }
    expect(await versionOf(other.userId, otherParent.token)).toBe(v);
  });

  it("連携済みの保護者が利用記録を送ることはできない（子どもの端末だけ）", async () => {
    const res = await post("/api/usage/upload", childBodies(CHILD_ID, 0)["/api/usage/upload"], PARENT);
    expect(res.status).toBe(403);
  });
});

describe("V: 保護者は連携していない子どものデータを読めない・変えられない（AC-13）", () => {
  it("連携していない子どもに対しては、すべての API が 403 で、相手の版も変わらない", async () => {
    const { child: other, parent: otherParent } = await newFamily("stranger");
    const v = await versionOf(other.userId, otherParent.token);
    const bodies = childBodies(other.userId, v);
    for (const [path, body] of Object.entries(bodies)) {
      const res = await post(path, body, PARENT);
      expect(res.status, path).toBe(403);
    }
    expect(await versionOf(other.userId, otherParent.token)).toBe(v);
  });

  it("紐づけ前の人（role: null）は、自分の userId を childId にしても何も扱えない", async () => {
    const newId = mockSessions["mock-google-new"].userId;
    const bodies = childBodies(newId, 0);
    for (const [path, body] of Object.entries(bodies)) {
      const res = await post(path, body, NEW);
      expect(res.status, path).toBe(403);
    }
  });

  it("自分の子どもの childId を使っても、ほかの子どものテスト期間の id は変えられない（not_found）", async () => {
    const { child: other, parent: otherParent } = await newFamily("idsteal");
    const ov = await versionOf(other.userId, otherParent.token);
    const created = await ok<{ testPeriod: { id: string }; configVersion: number }>(
      post("/api/test-period/create", { childId: other.userId, expectedVersion: ov, ...period }, otherParent.token),
    );
    const v = await versionOf(CHILD_ID, PARENT);
    const upd = await post(
      "/api/test-period/update",
      { childId: CHILD_ID, expectedVersion: v, id: created.testPeriod.id, ...period, name: "のっとり" },
      PARENT,
    );
    const del = await post(
      "/api/test-period/delete",
      { childId: CHILD_ID, expectedVersion: v, id: created.testPeriod.id },
      PARENT,
    );
    expect([upd.status, del.status]).toEqual([404, 404]);
    const list = await ok<{ testPeriods: { id: string; name: string }[] }>(
      post("/api/test-period/list", { childId: other.userId }, otherParent.token),
    );
    expect(list.testPeriods.map((t) => t.name)).toEqual(["テスト"]);
  });

  it("ペアリングの進み具合は、関わっていない人には not_found（あるかどうかも漏らさない）", async () => {
    const c = await newPerson("pc");
    const ticket = PairTicket.parse(await ok(post("/api/pair/start", {}, c.token)));
    for (const token of [PARENT, CHILD, NEW]) {
      const res = await post("/api/pair/status", { pairId: ticket.pairId }, token);
      expect(res.status).toBe(404);
    }
    const none = await post("/api/pair/status", { pairId: "no-such" }, NEW);
    expect(await none.json()).toEqual(await (await post("/api/pair/status", { pairId: ticket.pairId }, NEW)).json());
  });
});

describe("V: QR の code（MVP_SPEC 4.1）", () => {
  it("code に合言葉・userId・名前・pairId が入らず、推測されにくい長さの乱数（16進 40 文字）", async () => {
    const c = await newPerson("qr");
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const t = PairTicket.parse(await ok(post("/api/pair/start", { name: "たろう" }, c.token)));
      expect(t.code).toMatch(/^[0-9a-f]{40}$/);
      for (const secret of [c.token, c.userId, "たろう", c.name, t.pairId]) expect(t.code).not.toContain(secret);
      codes.add(t.code);
    }
    expect(codes.size).toBe(20);
  });

  it.todo("QRの期限切れ境界は期限ポリシー決定後に検証する");

  it("読んだ後・確定の前に同じ保護者が別の子どもとも連携できる（人数上限未決）", async () => {
    const parent = await newPerson("race-p");
    const c1 = await newPerson("race-c1");
    const c2 = await newPerson("race-c2");
    const t1 = PairTicket.parse(await ok(post("/api/pair/start", {}, c1.token)));
    const t2 = PairTicket.parse(await ok(post("/api/pair/start", {}, c2.token)));
    await ok(post("/api/pair/claim", { code: t1.code }, parent.token));
    await ok(post("/api/pair/claim", { code: t2.code }, parent.token));
    await ok(post("/api/pair/confirm", { pairId: t1.pairId, accept: true }, c1.token));
    const second = await post("/api/pair/confirm", { pairId: t2.pairId, accept: true }, c2.token);
    expect(second.status).toBe(200);
    const status = await ok<{ partners: { userId: string }[] }>(get("/api/link/status", parent.token));
    expect(status.partners.map((p) => p.userId).sort()).toEqual([c1.userId, c2.userId].sort());
  });

  it("QR を出した人が、別の QR を読んで保護者になった後は、自分の QR では子どもになれない（役割の取り違えを防ぐ）", async () => {
    const x = await newPerson("both-x");
    const y = await newPerson("both-y");
    const a = await newPerson("both-a");
    const tx = PairTicket.parse(await ok(post("/api/pair/start", {}, x.token))); // x が QR を出す
    const ta = PairTicket.parse(await ok(post("/api/pair/start", {}, a.token)));
    await ok(post("/api/pair/claim", { code: ta.code }, x.token)); // x が a の QR を読む
    await ok(post("/api/pair/claim", { code: tx.code }, y.token)); // y が x の QR を読む
    await ok(post("/api/pair/confirm", { pairId: ta.pairId, accept: true }, a.token)); // x は保護者に
    const res = await post("/api/pair/confirm", { pairId: tx.pairId, accept: true }, x.token);
    expect(res.status).toBe(409);
    expect((await ok<{ role: string }>(get("/api/auth/me", x.token))).role).toBe("parent");
  });
});

describe("V: エラーに中身が漏れない", () => {
  it("壊れた JSON は 400 bad_request で、JSON の解析器の文（SyntaxError）を返さない", async () => {
    const res = await postRaw("/api/plan/get", "{not json", PARENT);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toMatch(/SyntaxError|Unexpected token|JSON\.parse|at .*\.ts/);
  });

  it("合言葉がない・違うときは、入力の詳細（issues）を返さない", async () => {
    const res = await post("/api/plan/save", { childId: 1 }, "wrong-token");
    expect(res.status).toBe(401);
    expect((await res.json()).issues).toBeUndefined();
  });

  it("C10 が計算できない入力の文は利用者向けの日本語で、スタックや内部の名前を含まない", async () => {
    const v = await versionOf(CHILD_ID, PARENT);
    const res = await post(
      "/api/blank-period/create",
      { childId: CHILD_ID, expectedVersion: v, name: "a", startDate: "2026-11-01", endDate: "2026-11-05" },
      PARENT,
    );
    const v2 = (await res.json()).configVersion as number;
    const bad = await post(
      "/api/blank-period/create",
      { childId: CHILD_ID, expectedVersion: v2, name: "b", startDate: "2026-11-05", endDate: "2026-11-06" },
      PARENT,
    );
    expect(bad.status).toBe(400);
    const text = await bad.text();
    expect(text).not.toMatch(/PlanCalcError|Error:|\.ts:\d+|stack/);
  });
});

describe("V: 版のずれ（expectedVersion。Q6）", () => {
  it("設定を変えるすべての API で、古い版・先の版は 409 conflict、何も変わらない", async () => {
    const v = await versionOf(CHILD_ID, PARENT);
    const list = await ok<{ testPeriods: { id: string }[] }>(
      post("/api/test-period/list", { childId: CHILD_ID }, PARENT),
    );
    const tid = list.testPeriods[0]?.id ?? "x";
    for (const wrong of [v - 1, v + 1]) {
      const reqs: [string, unknown][] = [
        ["/api/plan/save", { childId: CHILD_ID, expectedVersion: wrong, ...plan }],
        ["/api/plan/usual-limit", { childId: CHILD_ID, expectedVersion: wrong, usualLimitMinutes: 10 }],
        ["/api/test-period/create", { childId: CHILD_ID, expectedVersion: wrong, ...period }],
        ["/api/test-period/update", { childId: CHILD_ID, expectedVersion: wrong, id: tid, ...period }],
        ["/api/test-period/delete", { childId: CHILD_ID, expectedVersion: wrong, id: tid }],
        ["/api/blank-period/create", { childId: CHILD_ID, expectedVersion: wrong, ...period }],
        ["/api/excluded-apps/save", { childId: CHILD_ID, expectedVersion: wrong, apps: [] }],
      ];
      for (const [path, body] of reqs) {
        const res = await post(path, body, PARENT);
        expect(res.status, `${path} v=${wrong}`).toBe(409);
      }
    }
    expect(await versionOf(CHILD_ID, PARENT)).toBe(v);
  });

  it("親と子が同じ版から同時に変えると、後から届いた方は conflict（上書きで消えない）", async () => {
    const v = await versionOf(CHILD_ID, PARENT);
    const a = await post("/api/test-period/create", { childId: CHILD_ID, expectedVersion: v, ...period }, PARENT);
    const b = await post(
      "/api/test-period/create",
      { childId: CHILD_ID, expectedVersion: v, name: "子の", startDate: "2026-12-01", endDate: "2026-12-01" },
      CHILD,
    );
    expect([a.status, b.status]).toEqual([200, 409]);
  });
});

describe("V: 送信 ID の重複（C8・AC-12）", () => {
  it("同じ送信 ID の再送は何度でも duplicate で、記録は1つ・中身も変わらない", async () => {
    const body = {
      submissionId: crypto.randomUUID(),
      childId: CHILD_ID,
      days: [day(TODAY, "2026-10-15T02:00:00Z", 30)],
    };
    const first = await ok<{ status: string; appliedDates: string[] }>(post("/api/usage/upload", body, CHILD));
    expect(first).toMatchObject({ status: "accepted", appliedDates: [TODAY] });
    for (let i = 0; i < 3; i++) {
      const again = await ok<{ status: string; appliedDates: string[] }>(post("/api/usage/upload", body, CHILD));
      expect(again).toMatchObject({ status: "duplicate", appliedDates: [TODAY] });
    }
    const view = await ok<{ days: { usedMinutes: number | null }[] }>(
      post("/api/usage/get", { childId: CHILD_ID, from: TODAY, to: TODAY }, PARENT),
    );
    expect(view.days[0]?.usedMinutes).toBe(30);
  });

  it("日の並びやアプリの並びだけが違う再送は、同じ中身として duplicate", async () => {
    const d1 = day(TODAY, "2026-10-15T02:00:00Z", 30);
    const d0 = day("2026-10-14", "2026-10-14T14:00:00Z", 20);
    const twoApps = {
      ...d1,
      apps: [
        { packageName: "a.a", label: "A", usedMinutes: 10, excluded: false },
        { packageName: "b.b", label: "B", usedMinutes: 20, excluded: false },
      ],
    };
    const id = crypto.randomUUID();
    await ok(post("/api/usage/upload", { submissionId: id, childId: CHILD_ID, days: [d0, twoApps] }, CHILD));
    const again = await ok<{ status: string }>(
      post(
        "/api/usage/upload",
        { submissionId: id, childId: CHILD_ID, days: [{ ...twoApps, apps: [...twoApps.apps].reverse() }, d0] },
        CHILD,
      ),
    );
    expect(again.status).toBe("duplicate");
  });

  it("ほかの子どもが同じ送信 ID を使っても conflict で、その子どもの記録は増えず、相手の中身も返らない", async () => {
    const { child: other } = await newFamily("dup");
    const id = crypto.randomUUID();
    await ok(
      post(
        "/api/usage/upload",
        { submissionId: id, childId: CHILD_ID, days: [day(TODAY, "2026-10-15T02:00:00Z", 30)] },
        CHILD,
      ),
    );
    const res = await post(
      "/api/usage/upload",
      { submissionId: id, childId: other.userId, days: [day(TODAY, "2026-10-15T02:00:00Z", 30)] },
      other.token,
    );
    expect(res.status).toBe(409);
    const text = await res.text();
    expect(text).not.toContain(CHILD_ID);
  });
});

describe("V: 余計な項目で中身を書き換えられない", () => {
  it("テスト期間の更新で createdByRole・createdByUserId を送っても無視され、作った人は変わらない", async () => {
    const v = await versionOf(CHILD_ID, PARENT);
    const created = await ok<{ testPeriod: { id: string }; configVersion: number }>(
      post("/api/test-period/create", { childId: CHILD_ID, expectedVersion: v, ...period }, CHILD),
    );
    const upd = await ok<{ testPeriod: { createdByRole: string; createdByUserId: string } }>(
      post(
        "/api/test-period/update",
        {
          childId: CHILD_ID,
          expectedVersion: created.configVersion,
          id: created.testPeriod.id,
          ...period,
          createdByRole: "parent",
          createdByUserId: "demo-parent",
        },
        CHILD,
      ),
    );
    expect(upd.testPeriod).toMatchObject({ createdByRole: "child", createdByUserId: CHILD_ID });
  });

  it("計画の保存で version・updatedAt・childId（ほかの子ども）を混ぜても、サーバの値が使われる", async () => {
    const v = await versionOf(CHILD_ID, PARENT);
    const r = await ok<{ plan: { version: number; childId: string } }>(
      post("/api/plan/save", { childId: CHILD_ID, expectedVersion: v, ...plan, version: 999 }, PARENT),
    );
    expect(r.plan).toMatchObject({ version: v + 1, childId: CHILD_ID });
  });
});
