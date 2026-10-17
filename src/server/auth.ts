// 合言葉（Authorization: Bearer <token>）から「呼んだ人」を決め、API ごとの決まり（contracts/api.ts の auth）と照らす（lead の担当）。
// route.ts の handle() / handleStream() が毎回呼ぶので、処理（handlers/）の中で書き忘れることはない。
// MOCK=1 は contracts/fixtures.ts の mockSessions。本物は DB の合言葉の表を引く（back-a。#21・#15。合言葉はそのまま保存しない）。
// 合言葉の有効期限は「最後に使ってから30日（使うたびに延長）」。サーバ側でいつでも無効にできる（decisions.md 10/17）。
import type { AuthRule } from "../../contracts/api";
import { mockSessions } from "../../contracts/fixtures";
import type { Session } from "../../contracts/schemas";
import { isMock } from "./env";
import { AppError } from "./errors";

// 呼んだ人。auth が "none" の API でだけ null になりうる
export type Caller = Session;

export function tokenOf(request: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  return m?.[1]?.trim() || null;
}

async function findSession(token: string): Promise<Session | null> {
  if (isMock()) return Object.values(mockSessions).find((s) => s.token === token) ?? null;
  // TODO(back-a): DB の合言葉の表から引く（#21）。それまでは本物のモードではログインできない
  throw new AppError("upstream_failed", "ログインの確認がまだ準備中です", "MOCK=1 で試してください");
}

// 決まりに合わなければ AppError（unauthorized / forbidden）を投げる
export async function authorize(rule: AuthRule, request: Request): Promise<Caller | null> {
  if (rule === "none") return null;
  const token = tokenOf(request);
  const caller = token ? await findSession(token) : null;
  if (!caller) throw new AppError("unauthorized");
  if (rule === "parent" && caller.role !== "parent")
    throw new AppError("forbidden", "保護者だけができる操作です", "保護者の端末から操作してください");
  if (rule === "child" && caller.role !== "child")
    throw new AppError("forbidden", "子どもの端末だけが送れる情報です", "子どもの端末から送ってください");
  return caller;
}

// 子どもは自分の分（入力の childId = 自分の userId）だけを扱える。他の子どものルールを読む・使用状況を送るのを止める。
// 保護者が「自分の家族の子どもか」は、ペアリングの表ができてから確かめる（層2・#22。使用状況は #29）
export function checkOwnChild(caller: Caller | null, input: unknown): void {
  if (caller?.role !== "child") return;
  const childId = (input as { childId?: unknown } | null)?.childId;
  if (typeof childId === "string" && childId !== caller.userId)
    throw new AppError("forbidden", "ほかの子どもの情報は扱えません", "自分の端末の情報だけを送ってください");
}
