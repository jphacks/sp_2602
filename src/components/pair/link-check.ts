// 連携状態（D2）の照会の結果を、どの表示にするかを決める純粋な関数（Figma 共01〜共03。画面 pair/index.tsx と pair/status.tsx が使う）。
// MVP_SPEC 4.1: レスポンスが消えたときは D2 を照会し、成功（linked）／失敗（unlinked）／不明（照会もできない）を区別する。
// 照会のきっかけ（reason）で、同じ結果でも出すものが変わる:
//   check  : ログイン後、QR に進む前に確かめる（役割選び）。unlinked なら役割選びへ。照会できなければ共01（QR へは進まない）
//   unsure : 紐づけの途中で通信が切れ、結果が分からない。まず共02 を出し、照会して unlinked なら共03「まだつながっていません」
import type { ApiError } from "@contracts/errors";
import type { LinkStatus } from "@contracts/schemas";

export type LinkCheckReason = "check" | "unsure";

// 照会の進み具合（画面が持つ）
export type LinkQuery =
  | { kind: "idle" } // まだ照会していない
  | { kind: "loading" }
  | { kind: "ok"; link: LinkStatus }
  | { kind: "error"; error: ApiError };

export type LinkCheckView =
  | { screen: "loading" }
  | { screen: "unknown"; error: ApiError | null } // 共01 連携状態を取得できない
  | { screen: "unsure"; error: ApiError | null } // 共02 連携結果が未確定
  | { screen: "incomplete" } // 共03 連携未完了
  | { screen: "linked" } // 連携済み → 役割を取り直して入口へ
  | { screen: "unlinked" }; // まだ連携していない（ふつうの状態）→ 役割選びを出す

// URL の reason（文字列）を読み取る。知らない値は check とみなす
export function linkCheckReasonOf(value: unknown): LinkCheckReason {
  return value === "unsure" ? "unsure" : "check";
}

export function linkCheckView(reason: LinkCheckReason, query: LinkQuery): LinkCheckView {
  switch (query.kind) {
    case "loading":
      return { screen: "loading" };
    case "idle":
      // check はすぐ照会するので読み込み中。unsure は「結果がまだ分かりません」を先に見せて、押したら照会する
      return reason === "unsure" ? { screen: "unsure", error: null } : { screen: "loading" };
    case "ok":
      if (query.link.state === "linked") return { screen: "linked" };
      return reason === "unsure" ? { screen: "incomplete" } : { screen: "unlinked" };
    case "error":
      // 照会できない＝まだ分からない。「未連携」と決めつけない（FigJam: 未連携と判断せず再確認）
      return reason === "unsure" ? { screen: "unsure", error: query.error } : { screen: "unknown", error: query.error };
  }
}

// 共03「もう一度はじめる」の行き先（どちらの役割で紐づけをしていたか）。分からなければ役割選び
export function restartHref(role: unknown): "/pair/child" | "/pair/parent" | "/pair" {
  if (role === "child") return "/pair/child";
  if (role === "parent") return "/pair/parent";
  return "/pair";
}
