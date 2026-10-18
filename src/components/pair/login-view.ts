// ログイン画面（Figma 子08・子09）の分かれ道を決める純粋な関数（画面 src/app/login.tsx が使う）。
//   - Google の結果: やめた（cancelled）はエラーにしない。失敗だけ子09 のダイアログを出す
//   - ログインの期限が切れて戻ってきた（session の error が unauthorized）ときは、ボタンを押す前に帯で知らせる。
//     保護者に連携を外されて戻ってきた（reason: family_unlink。D-133）ときも同じ帯で、サーバの文（「保護者との連携が外れました」）を出す
//   - 回数の上限（429 rate_limited）のときは、通信のせいにせず、待つように知らせる（サーバの hint「1分ほど待ってから…」）
import type { ApiError } from "@contracts/errors";
import type { GoogleResult } from "@/lib/google";

// 子09 のダイアログに出す中身。本文（body。ふつうは Figma の文「通信を確かめて…」）に、何が起きたか（detail）を小さく添える
export type LoginFailure = { body: string; detail: string };

// 子09 の Figma の本文
export const LOGIN_FAILED_BODY = "通信を確かめて、もう一度ためしてください。";

// Google ログインの結果 → idToken（サーバへ送る）か、ダイアログか、何もしない（やめた）か
export function googleOutcome(
  r: GoogleResult,
): { kind: "token"; idToken: string } | { kind: "failure"; failure: LoginFailure } | { kind: "none" } {
  if (r.status === "success") return { kind: "token", idToken: r.idToken };
  if (r.status === "cancelled") return { kind: "none" };
  return { kind: "failure", failure: { body: LOGIN_FAILED_BODY, detail: r.message } };
}

// サーバがログインを断った・通信できなかった。
// 回数の上限（429）のときは、本文をサーバの hint（待ってからもう一度）にする。
// なぜ: 前は「通信を確かめて…」と出て、すぐ押し直すとまた断られるだけだった
export function serverFailure(error: ApiError): LoginFailure {
  if (error.code === "rate_limited") return { body: error.hint, detail: error.message };
  return { body: LOGIN_FAILED_BODY, detail: error.message };
}

// 画面を開いたときの帯（ログインの期限切れ・連携が外れて戻ってきたとき）。この画面でログインを試した後は、ダイアログで知らせるので出さない
export function loginNotice(sessionError: ApiError | null, attempted: boolean): ApiError | null {
  if (attempted || !sessionError) return null;
  return sessionError.code === "unauthorized" ? sessionError : null;
}
