// Google の ID トークンを確かめる（C1 のサーバ検証）。端末が Google から受け取った「この人です」という証明書（JWT）の
// 署名（Google の公開鍵）・発行元（accounts.google.com）・宛先（自分の Web のクライアント ID）・期限を jose で確かめる。
// 確かめられたら、Google の利用者 ID（sub）と表示名を返す。合言葉（セッション）を出すのは handlers/authGoogle.ts。
import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { googleWebClientId } from "../env.js";
import { AppError } from "../errors.js";

// Google の公開鍵の一覧。jose が取得結果を覚えておき、鍵が入れ替わったときだけ取り直す
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleIdentity = { sub: string; name: string };

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  // JWT の形（3つの部分を . でつないだもの）でなければ、鍵を取りに行く前に断る
  if (idToken.split(".").length !== 3) throw new AppError("unauthorized");
  const audience = googleWebClientId();
  if (!audience)
    throw new AppError(
      "upstream_failed",
      "サーバに Google ログインの設定がありません",
      "担当者に GOOGLE_WEB_CLIENT_ID の設定を頼んでください（docs/google-login-setup.md）",
    );
  try {
    // exp（期限）と sub（利用者 ID）は必ずあるものとして確かめる（なぜ: jose は exp がないトークンを「期限なし」として通すため。
    // Google の ID トークンには必ず入っているので、ないものは偽物か壊れたもの）
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience,
      requiredClaims: ["exp", "sub"],
    });
    if (!payload.sub) throw new AppError("unauthorized");
    const name = typeof payload.name === "string" && payload.name ? payload.name : "Google のユーザー";
    return { sub: payload.sub, name };
  } catch (e) {
    if (e instanceof AppError) throw e;
    // 鍵を取りに行けなかった（Google に届かない・時間切れ）のは外部の失敗。それ以外（署名・期限・宛先の不一致）はログインの失敗
    if (e instanceof errors.JWKSTimeout || !(e instanceof errors.JOSEError)) throw new AppError("upstream_failed");
    throw new AppError("unauthorized");
  }
}
