// 確かめ役（V）: 合言葉の取り消しと、QR の番号を送る回数の上限。
//   - ログアウトすると、その合言葉はサーバでも使えなくなる（端末の中で消すだけにしない）
//   - 「ほかの端末からもログアウト」で、なくした端末の合言葉を止められる
//   - 保護者が子どもを外すと、子どもの合言葉はすべて使えなくなり、保護者もその子どものデータを扱えなくなる
//   - QR の番号を何度もまちがえると、しばらく断る（総当たりを防ぐ）
//   - ログイン・QR を出すのを短い間に何度もくり返すと、しばらく断る（F-5）
import { PairTicket } from "@contracts/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import app from "@/server/app";
import { PAIR_CLAIM_MAX_FAILURES, PAIR_CLAIM_WINDOW_MS } from "@/server/auth";
import { AUTH_IP_LIMIT, AUTH_SUBJECT_LIMIT, PAIR_START_LIMIT } from "@/server/rate-limit";
import { clock, codeOf, fresh, get, newFamily, newPerson, ok, post } from "./helpers";

beforeEach(async () => {
  await fresh("2026-10-15T03:00:00Z");
});

const wrongCode = (i: number) => `wrong-code-${i}`;

describe("V: ログアウトで合言葉を使えなくする", () => {
  it("ログアウトした合言葉は、サーバでも 401 になる。同じ人のほかの端末の合言葉はそのまま使える", async () => {
    const phone = await newPerson("a");
    const tablet = await newPerson("a"); // 同じ人が2台目の端末でログイン
    expect(tablet.userId).toBe(phone.userId);

    const res = await ok<{ revoked: number }>(post("/api/auth/sign-out", {}, phone.token));
    expect(res.revoked).toBe(1);
    expect((await get("/api/auth/me", phone.token)).status).toBe(401);
    expect((await get("/api/auth/me", tablet.token)).status).toBe(200);
  });

  it("「ほかの端末からもログアウト」は、今の端末以外の合言葉をすべて使えなくする（なくした端末を止める）", async () => {
    const lost = await newPerson("b");
    const lost2 = await newPerson("b");
    const current = await newPerson("b");

    const res = await ok<{ revoked: number }>(post("/api/auth/sign-out", { otherDevices: true }, current.token));
    expect(res.revoked).toBe(2);
    expect((await get("/api/auth/me", lost.token)).status).toBe(401);
    expect((await get("/api/auth/me", lost2.token)).status).toBe(401);
    expect((await get("/api/auth/me", current.token)).status).toBe(200);
  });

  it("ほかの人の合言葉は消えない", async () => {
    const me = await newPerson("c");
    const other = await newPerson("d");
    await ok(post("/api/auth/sign-out", { otherDevices: true }, me.token));
    expect((await get("/api/auth/me", other.token)).status).toBe(200);
  });

  it("合言葉がないとログアウトの API も 401", async () => {
    const res = await post("/api/auth/sign-out", {}, null);
    expect(res.status).toBe(401);
  });
});

describe("V: 保護者が子どもを外す", () => {
  it("外すと子どもの合言葉はすべて 401 になり、保護者もその子どものデータを扱えなくなる", async () => {
    const { child, parent } = await newFamily("u1");
    const child2 = await newPerson("c-u1"); // 子どもの2台目の端末
    expect((await get("/api/auth/me", child2.token)).status).toBe(200);

    const res = await ok<{ childId: string; revokedSessions: number }>(
      post("/api/family/unlink", { childId: child.userId }, parent.token),
    );
    expect(res).toEqual({ childId: child.userId, revokedSessions: 2 });

    expect((await get("/api/auth/me", child.token)).status).toBe(401);
    expect((await get("/api/auth/me", child2.token)).status).toBe(401);
    const read = await post("/api/plan/get", { childId: child.userId }, parent.token);
    expect(read.status).toBe(403);
    const family = await ok<{ children: unknown[] }>(get("/api/family/get", parent.token));
    expect(family.children).toEqual([]);
  });

  it("外された子どもは役割のない状態に戻り、もう一度 QR で紐づけ直せる", async () => {
    const { child, parent } = await newFamily("u2");
    await ok(post("/api/family/unlink", { childId: child.userId }, parent.token));

    const again = await newPerson("c-u2");
    expect(again.role).toBeNull();
    const ticket = PairTicket.parse(await ok(post("/api/pair/start", {}, again.token)));
    await ok(post("/api/pair/claim", { code: ticket.code }, parent.token));
    await ok(post("/api/pair/confirm", { pairId: ticket.pairId, accept: true }, again.token));
    expect((await post("/api/plan/get", { childId: child.userId }, parent.token)).status).toBe(200);
  });

  it("子どもは保護者を外せない（403）。連携していない子どもは外せない（403）", async () => {
    const a = await newFamily("u3");
    const b = await newFamily("u4");
    const byChild = await post("/api/family/unlink", { childId: a.child.userId }, a.child.token);
    expect(byChild.status).toBe(403);
    const otherFamily = await post("/api/family/unlink", { childId: b.child.userId }, a.parent.token);
    expect(otherFamily.status).toBe(403);
    // ほかの家族の子どもの合言葉は生きたまま
    expect((await get("/api/auth/me", b.child.token)).status).toBe(200);
  });
});

describe("V: QR の番号を送る回数の上限", () => {
  it(`${PAIR_CLAIM_MAX_FAILURES} 回まちがえると、正しい番号でも 429 rate_limited で断る`, async () => {
    const parent = await newPerson("p-r1");
    const child = await newPerson("c-r1");
    for (let i = 0; i < PAIR_CLAIM_MAX_FAILURES; i++) {
      const res = await post("/api/pair/claim", { code: wrongCode(i) }, parent.token);
      expect(res.status).toBe(404);
    }
    const ticket = PairTicket.parse(await ok(post("/api/pair/start", {}, child.token)));
    const blocked = await post("/api/pair/claim", { code: ticket.code }, parent.token);
    expect(blocked.status).toBe(429);
    expect(await codeOf(blocked)).toBe("rate_limited");
  });

  it("時間がたてば、また受け付ける", async () => {
    const parent = await newPerson("p-r2");
    const child = await newPerson("c-r2");
    for (let i = 0; i < PAIR_CLAIM_MAX_FAILURES; i++)
      await post("/api/pair/claim", { code: wrongCode(i) }, parent.token);
    clock.addMs(PAIR_CLAIM_WINDOW_MS);
    const ticket = PairTicket.parse(await ok(post("/api/pair/start", {}, child.token)));
    expect((await post("/api/pair/claim", { code: ticket.code }, parent.token)).status).toBe(200);
  });

  it("上限は人ごと。ほかの保護者は止まらない", async () => {
    const attacker = await newPerson("p-r3");
    const parent = await newPerson("p-r4");
    const child = await newPerson("c-r4");
    for (let i = 0; i < PAIR_CLAIM_MAX_FAILURES; i++)
      await post("/api/pair/claim", { code: wrongCode(i) }, attacker.token);
    const ticket = PairTicket.parse(await ok(post("/api/pair/start", {}, child.token)));
    expect((await post("/api/pair/claim", { code: ticket.code }, parent.token)).status).toBe(200);
  });

  it("上限の手前で成功すれば、まちがいの数は数え直す", async () => {
    const parent = await newPerson("p-r5");
    const child = await newPerson("c-r5");
    for (let i = 0; i < PAIR_CLAIM_MAX_FAILURES - 1; i++)
      await post("/api/pair/claim", { code: wrongCode(i) }, parent.token);
    const ticket = PairTicket.parse(await ok(post("/api/pair/start", {}, child.token)));
    expect((await post("/api/pair/claim", { code: ticket.code }, parent.token)).status).toBe(200);
    // 成功の後は、また上限の回数までまちがえられる（1回目のまちがいで止まらない）
    expect((await post("/api/pair/claim", { code: wrongCode(99) }, parent.token)).status).toBe(404);
  });
});

// セキュリティ検査 F-5（AVL-01）: ログインと QR を出す回数の上限
const loginFrom = (idToken: string, ip: string) =>
  app.request("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken }),
    headers: { "Content-Type": "application/json", "x-forwarded-for": `${ip}, 10.0.0.1` },
  });

describe("V: QR を出す回数の上限（F-5）", () => {
  it(`1人 ${PAIR_START_LIMIT.max} 回までは出せて、次は 429 rate_limited。ほかの子どもは止まらない`, async () => {
    const child = await newPerson("c-s1");
    const other = await newPerson("c-s2");
    for (let i = 0; i < PAIR_START_LIMIT.max; i++) await ok(post("/api/pair/start", {}, child.token));
    const blocked = await post("/api/pair/start", {}, child.token);
    expect(blocked.status).toBe(429);
    expect(await codeOf(blocked)).toBe("rate_limited");
    await ok(post("/api/pair/start", {}, other.token));
  });

  it(`同時に30本送っても、通るのは ${PAIR_START_LIMIT.max} 本まで。断った分は数えず、あとから上限まで出せる`, async () => {
    // 前は「数える→足す」を別々に行っていたので、同時に送ると30本とも 200 になった
    const child = await newPerson("c-s4");
    const burst = await Promise.all(Array.from({ length: 30 }, () => post("/api/pair/start", {}, child.token)));
    const statuses = burst.map((r) => r.status);
    expect(
      statuses.every((s) => s === 200 || s === 429),
      statuses.join(","),
    ).toBe(true);
    const passed = statuses.filter((s) => s === 200).length;
    expect(passed).toBeLessThanOrEqual(PAIR_START_LIMIT.max);
    for (let i = passed; i < PAIR_START_LIMIT.max; i++) await ok(post("/api/pair/start", {}, child.token));
    expect((await post("/api/pair/start", {}, child.token)).status).toBe(429);
  });

  it("時間がたてば、また出せる", async () => {
    const child = await newPerson("c-s3");
    for (let i = 0; i < PAIR_START_LIMIT.max; i++) await ok(post("/api/pair/start", {}, child.token));
    expect((await post("/api/pair/start", {}, child.token)).status).toBe(429);
    clock.addMs(PAIR_START_LIMIT.windowMs);
    await ok(post("/api/pair/start", {}, child.token));
  });
});

describe("V: ログインの回数の上限（F-5）", () => {
  it(`同じ人は ${AUTH_SUBJECT_LIMIT.max} 回までログインでき、次は 429 rate_limited。時間がたてば、また入れる`, async () => {
    for (let i = 0; i < AUTH_SUBJECT_LIMIT.max; i++)
      await ok(post("/api/auth/google", { idToken: "mock-new-l1" }, null));
    const blocked = await post("/api/auth/google", { idToken: "mock-new-l1" }, null);
    expect(blocked.status).toBe(429);
    expect(await codeOf(blocked)).toBe("rate_limited");
    // ほかの人は止まらない
    await ok(post("/api/auth/google", { idToken: "mock-new-l2" }, null));
    clock.addMs(AUTH_SUBJECT_LIMIT.windowMs);
    await ok(post("/api/auth/google", { idToken: "mock-new-l1" }, null));
  });

  it(`同じ IP からは ${AUTH_IP_LIMIT.max} 回まで（人が違っても数える）。ほかの IP は止まらない。時間がたてば、また入れる`, async () => {
    for (let i = 0; i < AUTH_IP_LIMIT.max; i++) await ok(loginFrom(`mock-new-ip${i}`, "203.0.113.5"));
    const blocked = await loginFrom("mock-new-ip-x", "203.0.113.5");
    expect(blocked.status).toBe(429);
    expect(await codeOf(blocked)).toBe("rate_limited");
    await ok(loginFrom("mock-new-ip-y", "198.51.100.7"));
    clock.addMs(AUTH_IP_LIMIT.windowMs);
    await ok(loginFrom("mock-new-ip-x", "203.0.113.5"));
  });

  it(`同じ IP・同じ人から同時に送っても、通るのは上限まで（IP ${AUTH_IP_LIMIT.max} 回・人 ${AUTH_SUBJECT_LIMIT.max} 回）`, async () => {
    const byIp = await Promise.all(
      Array.from({ length: AUTH_IP_LIMIT.max * 2 }, (_, i) => loginFrom(`mock-new-burst-ip${i}`, "203.0.113.20")),
    );
    expect(byIp.filter((r) => r.status === 200).length).toBeLessThanOrEqual(AUTH_IP_LIMIT.max);
    // 人ごと: IP は毎回変えて、人の上限だけにかける。先に1回ログインして、同時に作られた人が重ならないようにする
    await ok(post("/api/auth/google", { idToken: "mock-new-burst-subject" }, null));
    const bySubject = await Promise.all(
      Array.from({ length: AUTH_SUBJECT_LIMIT.max * 3 }, (_, i) =>
        loginFrom("mock-new-burst-subject", `198.51.100.${i + 1}`),
      ),
    );
    for (const res of [...byIp, ...bySubject]) expect([200, 429]).toContain(res.status);
    expect(bySubject.filter((r) => r.status === 200).length).toBeLessThanOrEqual(AUTH_SUBJECT_LIMIT.max - 1);
  });

  it("IP の上限は Google の確認より先に数える（通らない idToken でも数え、上限をこえたら 429）", async () => {
    // 通らない理由（401・Google の設定がない）はこのテストでは問わない
    for (let i = 0; i < AUTH_IP_LIMIT.max; i++)
      expect((await loginFrom("not-a-google-token", "203.0.113.9")).status).not.toBe(429);
    expect((await loginFrom("not-a-google-token", "203.0.113.9")).status).toBe(429);
  });
});
