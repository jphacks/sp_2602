// エラーの契約。どの API も失敗したら必ずこの形で返す。画面は message と hint をそのまま出せばよい。
import { z } from "zod";

export const ErrorCode = z.enum([
  "bad_request", // 入力が契約と合わない
  "not_found", // 対象がない
  "conflict", // 状態が合わない（二重登録など）
  "upstream_failed", // 外部サービス（AI・DB など）が失敗した
  "timeout", // 時間切れ
  "rate_limited", // 呼び出し回数の上限
  "network", // 通信できない（クライアント側でだけ作る）
  "internal", // それ以外のサーバの不具合
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiError = z.object({
  code: ErrorCode,
  message: z.string(), // 何が起きたか（利用者に見せる文）
  hint: z.string(), // 次に何をすればよいか（利用者に見せる文）
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(), // bad_request の詳細（開発者向け）
});
export type ApiError = z.infer<typeof ApiError>;

export const errorStatus: Record<ErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  conflict: 409,
  upstream_failed: 502,
  timeout: 504,
  rate_limited: 429,
  network: 0,
  internal: 500,
};

// 既定の文。サーバは状況に合った文で上書きしてよい。
export const errorText: Record<ErrorCode, { message: string; hint: string }> = {
  bad_request: { message: "入力の内容を受け付けられませんでした", hint: "入力を見直して、もう一度送ってください" },
  not_found: { message: "見つかりませんでした", hint: "最初の画面からやり直してください" },
  conflict: { message: "すでに処理されています", hint: "画面を更新してください" },
  upstream_failed: { message: "外部のサービスが応答しませんでした", hint: "少し待ってから、もう一度押してください" },
  timeout: { message: "時間がかかりすぎて中断しました", hint: "もう一度押してください" },
  rate_limited: { message: "混み合っています", hint: "30秒ほど待ってから、もう一度押してください" },
  network: { message: "通信できませんでした", hint: "接続を確認して、もう一度押してください" },
  internal: { message: "うまく処理できませんでした", hint: "もう一度押してください。続く場合は担当者に伝えてください" },
};
