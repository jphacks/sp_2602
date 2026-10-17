// 合言葉（Authorization: Bearer <token>）から「呼んだ人」を決め、API ごとの決まり（contracts/api.ts の auth）と照らす。
// route.ts の handle() / handleStream() が毎回呼ぶので、処理（handlers/）の中で書き忘れることはない。
// 合言葉と利用者は今はメモリ上の store（src/server/mock/store.ts）にある（DB はまだつないでいない）。
// 合言葉の有効期限は「最後に使ってから30日（使うたびに延長）」（作り直し前の決定 10/17）。
import type { AuthRule } from "../../contracts/api";
import type { Session } from "../../contracts/schemas";
import { AppError } from "./errors";
import { getStore } from "./mock/store";

// 呼んだ人。auth が "none" の API でだけ null になりうる
export type Caller = Session;

export function tokenOf(request: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  return m?.[1]?.trim() || null;
}

// 決まりに合わなければ AppError（unauthorized / forbidden）を投げる
export async function authorize(rule: AuthRule, request: Request): Promise<Caller | null> {
  if (rule === "none") return null;
  const token = tokenOf(request);
  const caller = token ? getStore().findSession(token) : null;
  if (!caller) throw new AppError("unauthorized");
  if (rule === "parent" && caller.role !== "parent")
    throw new AppError("forbidden", "保護者だけができる操作です", "保護者の端末から操作してください");
  if (rule === "child" && caller.role !== "child")
    throw new AppError("forbidden", "子どもの端末だけが送れる情報です", "子どもの端末から送ってください");
  return caller;
}

// 入力に childId がある API で、呼んだ人がその子どもを扱えるかを確かめる（D2 の認可。MVP_SPEC 4.1・6章）
//   子ども: 自分の childId だけ
//   保護者: D2 で連携済みの子どもだけ
//   紐づけ前（role: null）: どの子どもも扱えない
export function checkChildAccess(caller: Caller | null, input: unknown): void {
  if (!caller) return;
  const childId = (input as { childId?: unknown } | null)?.childId;
  if (typeof childId !== "string") return;
  if (caller.role === "child") {
    if (childId !== caller.userId)
      throw new AppError("forbidden", "ほかの子どもの情報は扱えません", "自分の端末の情報だけを扱ってください");
    return;
  }
  if (caller.role === "parent") {
    if (!getStore().isLinked(caller.userId, childId))
      throw new AppError("forbidden", "連携していない子どもの情報は扱えません", "QR で連携してから操作してください");
    return;
  }
  throw new AppError("forbidden", "まだ家族の連携が済んでいません", "QR で連携してから操作してください");
}
