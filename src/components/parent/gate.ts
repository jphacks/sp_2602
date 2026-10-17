// 保護者の画面で、見ている子どもが決まるまでの出し分け（純粋な関数。ChildGate・ParentChildGate が使う）。
//   child    : 見ている子どもが決まった → 中身を出す
//   unknown  : 家族の一覧を取れなかった → 「もう一度ためす」
//   loading  : 一覧の読み込み中（一覧はあるが、まだ見ている子どもが入っていない間も）
//   unlinked : 一覧は取れたが、連携している子どもがいない → QR の読み取り（/pair/parent）へ案内する
// なぜ unlinked にボタンが要るか: 前は「まだ子どもとつながっていません」と出すだけで、保護者の画面から QR を読む画面へ行く道がなかった。
//   連携を外された・サーバが作り直されて家族が空になった保護者（役割は parent のまま）は、ログアウトするしかなかった
import type { ApiError } from "@contracts/errors";
import type { Child } from "@contracts/schemas";

export type FamilyGate =
  | { kind: "child"; child: Child }
  | { kind: "unknown"; error: ApiError }
  | { kind: "loading" }
  | { kind: "unlinked" };

export function familyGate(child: Child | null, family: Child[] | null, familyError: ApiError | null): FamilyGate {
  if (child) return { kind: "child", child };
  if (familyError) return { kind: "unknown", error: familyError };
  if (family && family.length === 0) return { kind: "unlinked" };
  return { kind: "loading" };
}

// unlinked のときのボタン（QR の読み取りへ）。行き先は pair/parent.tsx（連携できたら通常上限を決めて、親のホームへ戻る）
export const scanQrAction = { label: "QRコードを読み取る", href: "/pair/parent" } as const;
