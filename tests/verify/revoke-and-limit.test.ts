// 確かめ役（V）: 合言葉の取り消しと、QR の番号を送る回数の上限。
//   - ログアウトすると、その合言葉はサーバでも使えなくなる（端末の中で消すだけにしない）
//   - 「ほかの端末からもログアウト」で、なくした端末の合言葉を止められる
//   - 保護者が子どもを外すと、子どもの合言葉はすべて使えなくなり、保護者もその子どものデータを扱えなくなる
//   - QR の番号を何度もまちがえると、しばらく断る（総当たりを防ぐ）
import { PairTicket } from "@contracts/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { PAIR_CLAIM_MAX_FAILURES, PAIR_CLAIM_WINDOW_MS } from "@/server/mock/store";
import { clock, codeOf, fresh, get, newFamily, newPerson, ok, post } from "./helpers";

beforeEach(() => {
  fresh("2026-10-15T03:00:00Z");
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
