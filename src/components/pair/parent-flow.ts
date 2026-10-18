// 保護者側の QR の読み取り（Figma 親10〜親15）で「今どの表示を出すか」を決める純粋な関数（画面 src/app/pair/parent.tsx が使う）。
//   カメラの権限を確かめる → 親10 permission（権限がない）/ 親11 scanning（読み取り中）
//   → 親12 verifying（pairClaim を送っている）→ waitingChild（子どもの「はい」を待つ。Figma にない）→ 親15 linked
//   途中: 親13 scanFailed（読み取れない・期限切れ・使用済み・すでに連携済み）/ 親14 saveFailed（サーバの不具合で保存できない）/
//         unsure（応答が届かず結果が分からない → 共02。MVP_SPEC 4.1）/ incomplete（子どもが「いいえ」・期限切れ → 共03）/
//         claimLimited（読み取りのまちがいが続き、サーバがしばらく断っている。429 rate_limited。Figma にない）
// 保存の確定（linked）を見るまで成功を出さない（MVP_SPEC 4.1）。
import type { ApiError } from "@contracts/errors";
import type { Child, PairStatus } from "@contracts/schemas";
import { isUncertain } from "./child-flow";

export type ParentPairView =
  | { screen: "permissionChecking" } // 権限を確かめている
  | { screen: "permission"; canAskAgain: boolean } // 親10
  | { screen: "scanning" } // 親11
  | { screen: "verifying"; code: string } // 親12
  | { screen: "scanFailed"; error: ApiError } // 親13（親11 の上のダイアログ）
  | { screen: "saveFailed"; code: string; error: ApiError } // 親14
  | { screen: "claimLimited"; error: ApiError } // 回数の上限（429）。しばらく待つように知らせる
  | { screen: "waitingChild"; status: PairStatus; offline: boolean } // 子どもの確認待ち
  | { screen: "incomplete"; reason: "rejected" | "expired" } // 共03
  | { screen: "unsure" } // 共02（連携状態の照会へ）
  | { screen: "linked"; child: Child }; // 親15

export type ParentPairEvent =
  | { type: "permission"; granted: boolean; canAskAgain: boolean }
  | { type: "scanned"; data: string } // カメラが QR を読んだ（data は QR の中身）
  | { type: "claimed"; status: PairStatus } // pairClaim の応答
  | { type: "claimFailed"; error: ApiError }
  | { type: "status"; status: PairStatus } // pairStatus の応答
  | { type: "statusFailed"; error: ApiError }
  | { type: "rescan" } // 親13「もう一度読み取る」・共03「もう一度はじめる」・回数の上限「もう一度読み取る」
  | { type: "retrySave" }; // 親14「もう一度ためす」

export const initialParentPairView: ParentPairView = { screen: "permissionChecking" };

// Slope の QR に入っているのは使い捨ての番号だけ（英数字と - _）。ほかの QR（URL など）はサーバに送らず、その場で親13 にする
// TODO(未決): 番号の形は契約（PairTicket.code は min(1) だけ）で決まっていない。MOCK の番号（40 文字の英数字）に合わせて 8〜128 文字にした
const CODE_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function qrCodeOf(data: string): string | null {
  const code = data.trim();
  return CODE_PATTERN.test(code) ? code : null;
}

// Slope の QR ではなかったときの文（端末の中で作る。サーバの errorText と同じ形）
export const notSlopeQr: ApiError = {
  code: "bad_request",
  message: "Slope の QR コードではありません",
  hint: "子どものスマホの Slope に出ている QR コードを読み取ってください",
};

// 回数の上限（429）のときの本文。サーバの hint（「10分ほど待ってから、子どもの端末で QR を出し直して読み取ってください」）を出す。
// hint が空のときは、この文にする
export const CLAIM_LIMITED_FALLBACK =
  "しばらく待ってから、子どものスマホで新しいQRコードを出してもらい、読み取ってください。";

export function claimLimitedText(error: ApiError): string {
  return error.hint.trim() || CLAIM_LIMITED_FALLBACK;
}

// pairStatus を定期的に聞くべき表示か（子どもの確認待ちのときだけ）
export function shouldPollParent(view: ParentPairView): boolean {
  return view.screen === "waitingChild";
}

// カメラを動かして読み取るべきか（親13 のダイアログ中・親12 の検証中は読まない = 同じ QR を何度も送らない）
export function shouldScan(view: ParentPairView): boolean {
  return view.screen === "scanning";
}

function fromStatus(status: PairStatus): ParentPairView {
  switch (status.state) {
    case "waiting": // 読んだ直後はふつう claimed。waiting が返るのは珍しいが、待つ表示にしておく
    case "claimed":
      return { screen: "waitingChild", status, offline: false };
    case "linked":
      return { screen: "linked", child: status.child };
    case "expired":
      return { screen: "incomplete", reason: "expired" };
    case "rejected":
      return { screen: "incomplete", reason: "rejected" };
  }
}

export function parentPairReducer(view: ParentPairView, event: ParentPairEvent): ParentPairView {
  switch (event.type) {
    case "permission":
      if (view.screen === "permissionChecking" || view.screen === "permission") {
        if (event.granted) return { screen: "scanning" };
        if (view.screen === "permission" && view.canAskAgain === event.canAskAgain) return view;
        return { screen: "permission", canAskAgain: event.canAskAgain };
      }
      // 読み取り中に権限を外された（設定で切った）ときだけ親10 に戻す
      if (view.screen === "scanning" && !event.granted) return { screen: "permission", canAskAgain: event.canAskAgain };
      return view;
    case "scanned": {
      if (view.screen !== "scanning") return view;
      const code = qrCodeOf(event.data);
      return code ? { screen: "verifying", code } : { screen: "scanFailed", error: notSlopeQr };
    }
    case "claimed":
      return view.screen === "verifying" ? fromStatus(event.status) : view;
    case "claimFailed":
      if (view.screen !== "verifying") return view;
      // 応答が届かなかった → 読み取りが通ったかどうか分からない（もう一度送ると「使用済み」になりうる）ので照会する（共02）
      if (event.error.code === "network" || event.error.code === "timeout") return { screen: "unsure" };
      // 回数の上限（まちがいが続いた。429）→ 待つように知らせる。
      // なぜ: 前は親14（「通信を確かめて…」と「もう一度ためす」）になり、通信のせいに見えたうえ、同じ番号で押し直しても
      //   10分ほどは断られ続けるだけだった。親14 には進めず、待ってから新しい QR を読み直してもらう
      if (event.error.code === "rate_limited") return { screen: "claimLimited", error: event.error };
      // サーバの不具合 → 保存できなかった（親14）。同じ番号でもう一度ためせる
      if (isUncertain(event.error)) return { screen: "saveFailed", code: view.code, error: event.error };
      // 期限切れ・使用済み・知らない番号・すでに連携済み・子どもの端末 → 読み取れませんでした（親13）
      return { screen: "scanFailed", error: event.error };
    case "status":
      if (view.screen !== "waitingChild" || event.status.pairId !== view.status.pairId) return view;
      return fromStatus(event.status);
    case "statusFailed":
      if (view.screen !== "waitingChild") return view;
      if (event.error.code === "not_found") return { screen: "incomplete", reason: "expired" };
      return view.offline ? view : { ...view, offline: true };
    case "rescan":
      return view.screen === "scanFailed" ||
        view.screen === "incomplete" ||
        view.screen === "saveFailed" ||
        view.screen === "claimLimited"
        ? { screen: "scanning" }
        : view;
    case "retrySave":
      return view.screen === "saveFailed" ? { screen: "verifying", code: view.code } : view;
  }
}
