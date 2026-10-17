// 通信の契約（アプリ ⇔ サーバ）。サーバとクライアントは必ずこの表を経由する（パスを手書きしない）。
//   kind "json"   : 1回の要求に1回の応答
//   kind "stream" : 応答を少しずつ返す（chunk を何回か → 最後に res を1回）。AI の返答や進み具合の表示に使う
// 失敗したときの形は errors.ts の ApiError に統一。
//   auth（誰が呼べるか。サーバの入口 src/server/route.ts が毎回確かめる。画面で隠すだけにしない）:
//     "none" だれでも / "signedIn" ログイン済み（ペアリング前も可） / "parent" 保護者だけ / "child" 子どもだけ
//     合言葉がない・無効なら unauthorized(401)、役割が違えば forbidden(403)
import { z } from "zod";
import { ApiError } from "./errors";
import { GoogleSignIn, Rules, RulesQuery, RulesSave, Session, SyncChunk, Usage, UsageReport } from "./schemas";

export const Health = z.object({ ok: z.literal(true), mock: z.boolean() });
export type Health = z.infer<typeof Health>;

export type AuthRule = "none" | "signedIn" | "parent" | "child";

export const api = {
  health: { kind: "json", method: "GET", path: "/api/health", auth: "none", req: z.void(), res: Health },
  // Google の ID トークンを確かめて、合言葉を出す（初めての人は登録もする。role は null のまま）
  authGoogle: { kind: "json", method: "POST", path: "/api/auth/google", auth: "none", req: GoogleSignIn, res: Session },
  // 今の合言葉の持ち主（役割を含む）。アプリの起動時に、親子どちらの画面に進むかを決めるのに使う
  authMe: { kind: "json", method: "GET", path: "/api/auth/me", auth: "signedIn", req: z.void(), res: Session },
  rulesGet: { kind: "json", method: "POST", path: "/api/rules/get", auth: "signedIn", req: RulesQuery, res: Rules },
  rulesSave: { kind: "json", method: "POST", path: "/api/rules/save", auth: "parent", req: RulesSave, res: Rules },
  usageReport: {
    kind: "json",
    method: "POST",
    path: "/api/usage/report",
    auth: "child",
    req: UsageReport,
    res: Usage,
  },
  usageGet: { kind: "json", method: "POST", path: "/api/usage/get", auth: "parent", req: RulesQuery, res: Usage },
  rulesSyncStream: {
    kind: "stream",
    method: "POST",
    path: "/api/rules/sync-stream",
    auth: "signedIn",
    req: RulesQuery,
    chunk: SyncChunk,
    res: Rules,
  },
} as const satisfies Record<string, { auth: AuthRule; [key: string]: unknown }>;

export type Api = typeof api;
export type RouteName = keyof Api;
export type JsonRoute = { [K in RouteName]: Api[K]["kind"] extends "json" ? K : never }[RouteName];
export type StreamRoute = { [K in RouteName]: Api[K]["kind"] extends "stream" ? K : never }[RouteName];
export type Req<K extends RouteName> = z.infer<Api[K]["req"]>;
export type Res<K extends RouteName> = z.infer<Api[K]["res"]>;
export type Chunk<K extends StreamRoute> = z.infer<Api[K]["chunk"]>;
// ストリームの API 1本の形。stream() / handleStream() はこれで読む（ストリームの API が1本もない時も型が崩れない）
export type StreamDef = {
  kind: "stream";
  method: string;
  path: string;
  auth: AuthRule;
  req: z.ZodType;
  chunk: z.ZodType;
  res: z.ZodType;
};

// ストリームで流れる1行（NDJSON）の形
export const streamLine = <C extends z.ZodType, R extends z.ZodType>(chunk: C, res: R) =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("chunk"), data: chunk }),
    z.object({ type: z.literal("done"), data: res }),
    z.object({ type: z.literal("error"), error: ApiError }),
  ]);
