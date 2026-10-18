// 確かめ役（V）: デモの固定の合言葉（contracts/fixtures.ts の mockSessions。公開リポジトリに平文）が、MOCK=1 でない
// サーバで通らないこと（セキュリティ自己点検 🔴1）。
// 前は、合言葉の照合（src/server/auth.ts の findSession）がハッシュの一致だけを見ていた。MOCK=1 のサーバが一度でも
// DB に見本を入れると（seedMockAccounts）、MOCK を外した後もだれでもデモの人として入れた。
// 手元のサーバに外の DB（Neon）の DATABASE_URL を入れて MOCK=1 で立てるだけで、その DB に固定の合言葉が入っていた。
import { mockSessions } from "@contracts/fixtures";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signInGoogle } from "@/server/auth";
import * as runtimeDb from "@/server/db";
import { CHILD, CHILD_ID, codeOf, fresh, get, NEW, newPerson, PARENT, post } from "./helpers";

const mockBefore = process.env.MOCK;
beforeEach(async () => {
  process.env.MOCK = "1";
  await fresh("2026-10-15T03:00:00Z"); // MOCK=1 なので、デモの3人（固定の合言葉）が DB に入る
});
afterEach(() => {
  process.env.MOCK = mockBefore;
});

describe("V: MOCK でないサーバでは、MOCK のログインの合言葉を断る（🔴1）", () => {
  it("DB に残ったデモの固定の合言葉（保護者・子ども・はじめての人）は、MOCK=1 でなければ 401", async () => {
    // MOCK=1 のうちは使える（手元の開発・デモ）
    for (const token of [PARENT, CHILD, NEW]) expect((await get("/api/auth/me", token)).status).toBe(200);
    for (const value of ["0", undefined, "true"]) {
      if (value === undefined) delete process.env.MOCK;
      else process.env.MOCK = value;
      for (const token of [PARENT, CHILD, NEW]) {
        const res = await get("/api/auth/me", token);
        expect(res.status, `MOCK=${value} ${token}`).toBe(401);
        expect(await codeOf(res)).toBe("unauthorized");
      }
      // 保護者だけの操作・子どもの記録の読み取りも通らない
      const plan = await post("/api/plan/get", { childId: CHILD_ID }, PARENT);
      expect(plan.status, `MOCK=${value}`).toBe(401);
    }
  });

  it("Vercel の本番（VERCEL_ENV=production）では、MOCK=1 が入っていてもデモの合言葉は 401", async () => {
    const before = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    try {
      expect((await get("/api/auth/me", mockSessions["mock-google-parent"].token)).status).toBe(401);
    } finally {
      if (before === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = before;
    }
  });

  it("MOCK のログインで作った「はじめての人」の合言葉（乱数）も、MOCK=1 でなければ 401", async () => {
    const person = await newPerson("guard");
    expect((await get("/api/auth/me", person.token)).status).toBe(200);
    process.env.MOCK = "0";
    expect((await get("/api/auth/me", person.token)).status).toBe(401);
  });

  it("Google でログインした人の合言葉は、MOCK=1 でなくても使える", async () => {
    const google = await signInGoogle("google-sub-guard", "グーグルの人");
    process.env.MOCK = "0";
    const res = await get("/api/auth/me", google.token);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { userId: string }).userId).toBe(google.userId);
  });

  it("MOCK=1 に戻せば、デモの合言葉はまた使える（手元の開発・テストを壊さない）", async () => {
    process.env.MOCK = "0";
    expect((await get("/api/auth/me", PARENT)).status).toBe(401);
    process.env.MOCK = "1";
    expect((await get("/api/auth/me", PARENT)).status).toBe(200);
  });

  it("DB を開いたときに見本を自動で入れるのは、MOCK=1 で手元の DB（PGlite）のときだけ。外の DB（DATABASE_URL）には入れない", () => {
    // 直す前はこの判定がなく、MOCK=1 なら外の DB にも入れていた（src/server/db/index.ts の open）
    const { seedsMockOnOpen } = runtimeDb as unknown as { seedsMockOnOpen: (kind: "neon" | "pglite") => boolean };
    expect(typeof seedsMockOnOpen).toBe("function");
    expect(seedsMockOnOpen("pglite")).toBe(true);
    expect(seedsMockOnOpen("neon")).toBe(false);
    process.env.MOCK = "0";
    expect(seedsMockOnOpen("pglite")).toBe(false);
  });
});
