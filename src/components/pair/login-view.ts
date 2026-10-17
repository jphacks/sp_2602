// ログイン画面（Figma 子08・子09）の分かれ道を決める純粋な関数（画面 src/app/login.tsx が使う）。
//   - Google の結果: やめた（cancelled）はエラーにしない。失敗だけ子09 のダイアログを出す
//   - ログインの期限が切れて戻ってきた（session の error が unauthorized）ときは、ボタンを押す前に帯で知らせる
import type { ApiError } from "@contracts/errors";
import type { GoogleResult } from "@/lib/google";

// 子09 のダイアログに出す中身。Figma の文（通信を確かめて…）に、何が起きたか（detail）を小さく添える
export type LoginFailure = { detail: string };

// Google ログインの結果 → idToken（サーバへ送る）か、ダイアログか、何もしない（やめた）か
export function googleOutcome(
  r: GoogleResult,
): { kind: "token"; idToken: string } | { kind: "failure"; failure: LoginFailure } | { kind: "none" } {
  if (r.status === "success") return { kind: "token", idToken: r.idToken };
  if (r.status === "cancelled") return { kind: "none" };
  return { kind: "failure", failure: { detail: r.message } };
}

// サーバがログインを断った・通信できなかった
export function serverFailure(error: ApiError): LoginFailure {
  return { detail: error.message };
}

// 画面を開いたときの帯（ログインの期限切れで戻ってきたとき）。この画面でログインを試した後は、ダイアログで知らせるので出さない
export function loginNotice(sessionError: ApiError | null, attempted: boolean): ApiError | null {
  if (attempted || !sessionError) return null;
  return sessionError.code === "unauthorized" ? sessionError : null;
}
