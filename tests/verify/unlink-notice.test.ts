// 確かめ役（V）: 連携を外された子どもの端末への 401 の理由（D-133）。
//   - 保護者が外したあと、子どもの合言葉で呼ぶと 401 unauthorized に reason: "family_unlink" が付く（どの API でも・どの端末の合言葉でも）
//   - ログアウトした・ほかの端末からログアウトされた・30 日使わなかった・知らない合言葉の 401 には付かない
//   - 無効にした合言葉には、理由（revoked_reason）が残る
//   - デモの子ども（合言葉が固定）は、ログインし直せば同じ合言葉がまた使える（理由も消える）
import { ApiError } from "@contracts/errors";
import { mockSessions } from "@contracts/fixtures";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { SESSION_IDLE_MS } from "@/server/auth";
import { digest } from "@/server/auth/digest";
import { db } from "@/server/db";
import { userSessions } from "../../backend/src/db/schema/index";
import { CHILD, CHILD_ID, clock, fresh, get, newFamily, newPerson, ok, PARENT, post } from "./helpers";

beforeEach(async () => {
  await fresh("2026-10-15T03:00:00Z");
});

// 401 の本文（ApiError の形で読む）
async function unauthorizedBody(res: Response) {
  expect(res.status).toBe(401);
  return ApiError.parse(await res.json());
}

const reasonOf = async (token: string) =>
  (
    await (
      await db()
    )
      .select({ reason: userSessions.revokedReason, revokedAt: userSessions.revokedAt })
      .from(userSessions)
      .where(eq(userSessions.tokenHash, digest(token)))
  )[0];

describe("V: 外された子どもの端末には、401 に理由（family_unlink）が付く（D-133）", () => {
  it("外したあと、子どもの合言葉（2台とも）でどの API を呼んでも 401 に reason: family_unlink が付く", async () => {
    const { child, parent } = await newFamily("n1");
    const child2 = await newPerson("c-n1"); // 子どもの2台目の端末
    await ok(post("/api/family/unlink", { childId: child.userId }, parent.token));

    for (const token of [child.token, child2.token]) {
      const me = await unauthorizedBody(await get("/api/auth/me", token));
      expect(me).toMatchObject({
        code: "unauthorized",
        reason: "family_unlink",
        message: "保護者との連携が外れました",
      });
      // 子どもだけの API・子どもの範囲を確かめる API でも同じ（役割を確かめるより先に 401 になる）
      const config = await unauthorizedBody(await post("/api/config/get", { childId: child.userId }, token));
      expect(config.reason).toBe("family_unlink");
      const upload = await unauthorizedBody(
        await post("/api/device-status/report", { childId: child.userId, permissions: {}, measuredAt: "x" }, token),
      );
      expect(upload.reason).toBe("family_unlink");
    }
    expect(await reasonOf(child.token)).toMatchObject({ reason: "family_unlink" });
  });

  it("外したあとにログインし直した新しい合言葉は使える。古い合言葉は理由付きの 401 のまま", async () => {
    const { child, parent } = await newFamily("n2");
    await ok(post("/api/family/unlink", { childId: child.userId }, parent.token));
    const again = await newPerson("c-n2");
    expect((await get("/api/auth/me", again.token)).status).toBe(200);
    expect((await unauthorizedBody(await get("/api/auth/me", child.token))).reason).toBe("family_unlink");
  });

  it("保護者の合言葉は外したあとも使える（理由は付かない）", async () => {
    const { child, parent } = await newFamily("n3");
    await ok(post("/api/family/unlink", { childId: child.userId }, parent.token));
    expect((await get("/api/auth/me", parent.token)).status).toBe(200);
  });

  it("デモの子ども（合言葉が固定）は、外されたあとログインし直せば同じ合言葉がまた使える（理由も消える）", async () => {
    await ok(post("/api/family/unlink", { childId: CHILD_ID }, PARENT));
    expect((await unauthorizedBody(await get("/api/auth/me", CHILD))).reason).toBe("family_unlink");
    await ok(post("/api/auth/google", { idToken: "mock-google-child" }, null));
    expect((await get("/api/auth/me", CHILD)).status).toBe(200);
    expect(await reasonOf(mockSessions["mock-google-child"].token)).toEqual({ reason: null, revokedAt: null });
  });
});

describe("V: ほかの 401 には理由が付かない（D-133）", () => {
  it("ログアウトした合言葉: 401 に reason なし。理由は sign_out で残る", async () => {
    const me = await newPerson("n4");
    await ok(post("/api/auth/sign-out", {}, me.token));
    const body = await unauthorizedBody(await get("/api/auth/me", me.token));
    expect(body.code).toBe("unauthorized");
    expect(body.reason).toBeUndefined();
    expect(await reasonOf(me.token)).toMatchObject({ reason: "sign_out" });
  });

  it("ほかの端末からログアウトされた合言葉: 401 に reason なし。理由は sign_out_others で残る", async () => {
    const lost = await newPerson("n5");
    const current = await newPerson("n5");
    await ok(post("/api/auth/sign-out", { otherDevices: true }, current.token));
    expect((await unauthorizedBody(await get("/api/auth/me", lost.token))).reason).toBeUndefined();
    expect(await reasonOf(lost.token)).toMatchObject({ reason: "sign_out_others" });
  });

  it("30 日使わずに期限が切れた合言葉・知らない合言葉・合言葉なし: 401 に reason なし", async () => {
    const idle = await newPerson("n6");
    clock.addMs(SESSION_IDLE_MS + 60_000);
    expect((await unauthorizedBody(await get("/api/auth/me", idle.token))).reason).toBeUndefined();
    expect((await unauthorizedBody(await get("/api/auth/me", "no-such-token"))).reason).toBeUndefined();
    expect((await unauthorizedBody(await get("/api/auth/me", null))).reason).toBeUndefined();
  });

  it("外せなかったとき（403）は、子どもの合言葉は使えるまま", async () => {
    const a = await newFamily("n7");
    const b = await newFamily("n8");
    expect((await post("/api/family/unlink", { childId: b.child.userId }, a.parent.token)).status).toBe(403);
    expect((await get("/api/auth/me", b.child.token)).status).toBe(200);
    expect(await reasonOf(b.child.token)).toEqual({ reason: null, revokedAt: null });
  });
});

describe("V: 合言葉がまだ使えるかの確かめ（authCheck。D-134）", () => {
  const lastUsedOf = async (token: string) =>
    (
      await (await db())
        .select({ lastUsedAt: userSessions.lastUsedAt })
        .from(userSessions)
        .where(eq(userSessions.tokenHash, digest(token)))
    )[0]?.lastUsedAt.toISOString();

  it("使える合言葉なら 200 { ok: true }。中身（名前・役割）は返さない", async () => {
    const { child } = await newFamily("k1");
    expect(await ok(get("/api/auth/check", child.token))).toEqual({ ok: true });
  });

  it("DB に書かない: 何度呼んでも「最後に使った時刻」は変わらない（合言葉の期限も延びない）", async () => {
    const { child } = await newFamily("k2");
    const before = await lastUsedOf(child.token);
    for (let i = 0; i < 3; i++) {
      clock.addMs(5 * 60_000);
      await ok(get("/api/auth/check", child.token));
    }
    expect(await lastUsedOf(child.token)).toBe(before);
    // ふつうの API（authMe）は今までどおり延ばす
    await ok(get("/api/auth/me", child.token));
    expect(await lastUsedOf(child.token)).not.toBe(before);
  });

  it("30 日使っていない合言葉は、authCheck を呼び続けても期限が切れる（理由なしの 401）", async () => {
    const { child } = await newFamily("k3");
    for (let i = 0; i < 31; i++) {
      clock.addMs(86_400_000);
      await get("/api/auth/check", child.token);
    }
    expect((await unauthorizedBody(await get("/api/auth/check", child.token))).reason).toBeUndefined();
  });

  it("外された子どもの合言葉は 401 + reason: family_unlink。ログアウトした・知らない・なしは理由なしの 401", async () => {
    const { child, parent } = await newFamily("k4");
    await ok(post("/api/family/unlink", { childId: child.userId }, parent.token));
    expect((await unauthorizedBody(await get("/api/auth/check", child.token))).reason).toBe("family_unlink");

    const me = await newPerson("k5");
    await ok(post("/api/auth/sign-out", {}, me.token));
    expect((await unauthorizedBody(await get("/api/auth/check", me.token))).reason).toBeUndefined();
    expect((await unauthorizedBody(await get("/api/auth/check", "no-such-token"))).reason).toBeUndefined();
    expect((await unauthorizedBody(await get("/api/auth/check", null))).reason).toBeUndefined();
  });

  it("回数の上限に数えない（1分に何回呼んでも 429 にならない）", async () => {
    const { child } = await newFamily("k6");
    for (let i = 0; i < 30; i++) expect((await get("/api/auth/check", child.token)).status).toBe(200);
  });
});
