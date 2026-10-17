// 確かめ役（V）: Google の ID トークンの検証（C1 のサーバ検証・plan.md の決定）。
// 本物の Google の公開鍵の代わりに、テストで作った鍵の一覧（JWKS）を使う（jose の createRemoteJWKSet だけを差し替える）。
// 確かめること: 署名・発行元（iss）・宛先（aud = GOOGLE_WEB_CLIENT_ID）・期限（exp）の抜けがないこと、
//   "mock-" の idToken は MOCK=1 のときだけ受け付けること、GOOGLE_WEB_CLIENT_ID がないと本物のログインは upstream_failed。
import { ApiError } from "@contracts/errors";
import { Session } from "@contracts/schemas";
import { createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type JWTPayload, SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fresh, post } from "./helpers";

// 差し替えた鍵の一覧（beforeAll で入れる）
const holder: { jwks: ReturnType<typeof createLocalJWKSet> | null } = { jwks: null };

vi.mock("jose", async (importOriginal) => {
  const orig = await importOriginal<typeof import("jose")>();
  return {
    ...orig,
    // google.ts はファイルを読み込んだときに1回だけ createRemoteJWKSet を呼ぶので、後から入れた鍵の一覧へ渡す関数を返す
    createRemoteJWKSet: () => (header: Parameters<ReturnType<typeof orig.createLocalJWKSet>>[0], token: never) => {
      if (!holder.jwks) throw new Error("鍵の一覧がまだない");
      return holder.jwks(header, token);
    },
  };
});

const CLIENT_ID = "test-web-client.apps.googleusercontent.com";
let googleKey: CryptoKey;
let otherKey: CryptoKey;

beforeAll(async () => {
  const google = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  googleKey = google.privateKey;
  otherKey = other.privateKey;
  const jwk: JWK = { ...(await exportJWK(google.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  holder.jwks = createLocalJWKSet({ keys: [jwk] });
});

const envBefore = { MOCK: process.env.MOCK, GOOGLE_WEB_CLIENT_ID: process.env.GOOGLE_WEB_CLIENT_ID };
beforeEach(() => {
  process.env.GOOGLE_WEB_CLIENT_ID = CLIENT_ID;
  process.env.MOCK = "1";
  fresh("2026-10-15T03:00:00Z");
});
afterEach(() => {
  process.env.MOCK = envBefore.MOCK;
  if (envBefore.GOOGLE_WEB_CLIENT_ID === undefined) delete process.env.GOOGLE_WEB_CLIENT_ID;
  else process.env.GOOGLE_WEB_CLIENT_ID = envBefore.GOOGLE_WEB_CLIENT_ID;
});

const nowSec = () => Math.floor(Date.now() / 1000);

async function token(
  over: { iss?: string; aud?: string; exp?: number; sub?: string | null; key?: CryptoKey; kid?: string } = {},
  extra: JWTPayload = {},
) {
  const jwt = new SignJWT({ name: "グーグルの人", ...extra })
    .setProtectedHeader({ alg: "RS256", kid: over.kid ?? "k1" })
    .setIssuer(over.iss ?? "https://accounts.google.com")
    .setAudience(over.aud ?? CLIENT_ID)
    .setIssuedAt(nowSec() - 60)
    .setExpirationTime(over.exp ?? nowSec() + 3600);
  if (over.sub !== null) jwt.setSubject(over.sub ?? "google-sub-1");
  return jwt.sign(over.key ?? googleKey);
}

const signIn = (idToken: string) => post("/api/auth/google", { idToken }, null);
const codeOf = async (res: Response) => ApiError.parse(await res.json()).code;

describe("V: Google の ID トークンの検証", () => {
  it("正しいトークン（iss は https あり・なしの両方）は受け付け、role: null の Session を返す。同じ sub は同じ人", async () => {
    const a = Session.parse(await (await signIn(await token())).json());
    expect(a.role).toBeNull();
    expect(a.name).toBe("グーグルの人");
    const b = Session.parse(await (await signIn(await token({ iss: "accounts.google.com" }))).json());
    expect(b.userId).toBe(a.userId);
    expect(b.token).not.toBe(a.token);
  });

  it("宛先（aud）が違うトークンは 401", async () => {
    const res = await signIn(await token({ aud: "someone-else.apps.googleusercontent.com" }));
    expect(res.status).toBe(401);
    expect(await codeOf(res)).toBe("unauthorized");
  });

  it("発行元（iss）が違うトークンは 401", async () => {
    const res = await signIn(await token({ iss: "https://evil.example.com" }));
    expect(res.status).toBe(401);
  });

  it("期限（exp）が切れたトークンは 401", async () => {
    const res = await signIn(await token({ exp: nowSec() - 10 }));
    expect(res.status).toBe(401);
  });

  it("Google ではない鍵で署名したトークン・知らない鍵 ID は 401", async () => {
    expect((await signIn(await token({ key: otherKey }))).status).toBe(401);
    expect((await signIn(await token({ key: otherKey, kid: "unknown" }))).status).toBe(401);
  });

  it("中身を書き換えたトークン（署名が合わない）は 401", async () => {
    const t = await token();
    const [h, , s] = t.split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "admin", aud: CLIENT_ID, iss: "https://accounts.google.com", exp: nowSec() + 999 }),
    ).toString("base64url");
    expect((await signIn(`${h}.${forged}.${s}`)).status).toBe(401);
  });

  it("sub がないトークンは 401", async () => {
    expect((await signIn(await token({ sub: null }))).status).toBe(401);
  });

  it("期限（exp）がないトークンは 401（jose は exp がないと期限なしとして通すので、requiredClaims で必須にしている）", async () => {
    const noExp = await new SignJWT({ name: "グーグルの人" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer("https://accounts.google.com")
      .setAudience(CLIENT_ID)
      .setIssuedAt(nowSec() - 60)
      .setSubject("google-sub-noexp")
      .sign(googleKey);
    const res = await signIn(noExp);
    expect(res.status).toBe(401);
    expect(await codeOf(res)).toBe("unauthorized");
  });

  it("alg: none（署名なし）のトークンは 401", async () => {
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const t = `${enc({ alg: "none", typ: "JWT" })}.${enc({ sub: "x", aud: CLIENT_ID, iss: "https://accounts.google.com", exp: nowSec() + 999 })}.`;
    expect((await signIn(t)).status).toBe(401);
  });

  it("GOOGLE_WEB_CLIENT_ID がないサーバでは、本物のトークンは upstream_failed（宛先を確かめずに通さない）", async () => {
    delete process.env.GOOGLE_WEB_CLIENT_ID;
    const res = await signIn(await token());
    expect(res.status).toBe(502);
    expect(await codeOf(res)).toBe("upstream_failed");
  });

  it('MOCK が "1" 以外（未設定・"true"・"0"）なら mock- の idToken は 401', async () => {
    for (const v of [undefined, "true", "0", "yes"]) {
      if (v === undefined) delete process.env.MOCK;
      else process.env.MOCK = v;
      const res = await signIn("mock-google-parent");
      expect(res.status, `MOCK=${v}`).toBe(401);
    }
  });

  it("MOCK=1 でも本物のトークンは検証する（宛先が違えば 401）", async () => {
    process.env.MOCK = "1";
    expect((await signIn(await token({ aud: "x" }))).status).toBe(401);
  });

  it('エラーの本文に jose の例外の文（例: JWTExpired・"exp" claim）を出さない', async () => {
    const res = await signIn(await token({ exp: nowSec() - 10 }));
    const text = await res.text();
    expect(text).not.toMatch(/JWT|claim|jose|timestamp check/i);
  });
});
