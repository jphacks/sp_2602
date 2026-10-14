// 通信の契約（画面 ⇔ サーバ）。サーバとクライアントは必ずこの表を経由する（パスを手書きしない）。
//   kind "json"   : 1回の要求に1回の応答
//   kind "stream" : 応答を少しずつ返す（chunk を何回か → 最後に res を1回）。AI の返答や進み具合の表示に使う
// 失敗したときの形は errors.ts の ApiError に統一。
import { z } from "zod";
import { ApiError } from "./errors";
import { AnalyzeChunk, AnalyzeRequest, AnalyzeResult } from "./schemas";

export const Health = z.object({ ok: z.literal(true), mock: z.boolean() });
export type Health = z.infer<typeof Health>;

export const api = {
  health: { kind: "json", method: "GET", path: "/api/health", req: z.void(), res: Health },
  analyze: { kind: "json", method: "POST", path: "/api/analyze", req: AnalyzeRequest, res: AnalyzeResult },
  analyzeStream: {
    kind: "stream",
    method: "POST",
    path: "/api/analyze-stream",
    req: AnalyzeRequest,
    chunk: AnalyzeChunk,
    res: AnalyzeResult,
  },
} as const;

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
