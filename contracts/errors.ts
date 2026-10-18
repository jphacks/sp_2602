// エラーの契約。どの API も失敗したら必ずこの形で返す。画面は message と hint をそのまま出せばよい。
import { z } from "zod";

export const ErrorCode = z.enum([
  "bad_request", // 入力が契約と合わない
  "unauthorized", // 合言葉がない・無効（ログインしていない）
  "forbidden", // ログインしているが、その操作をしてよい役割ではない（子どもが保護者の操作をした等）
  "not_found", // 対象がない
  "conflict", // 状態が合わない（二重登録など）
  "upstream_failed", // 外部サービス（AI・DB など）が失敗した
  "timeout", // 時間切れ
  "rate_limited", // 呼び出し回数の上限
  "unavailable", // サーバの DB につながらないなど、一時的に使えない（503。少し待てば直る）
  "network", // 通信できない（クライアント側でだけ作る）
  "internal", // それ以外のサーバの不具合
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

// 合言葉が無効（unauthorized・401）になった理由（D-133）。サーバが「無効にした合言葉」で呼ばれたときだけ付ける
// （知らない合言葉・ログアウトした合言葉・外されずに 30 日使わず期限が切れただけの合言葉には付けない。
//   外された合言葉は、そのあと 30 日たって期限が切れていても付く。端末の制限を止める側に倒れるので、それでよい）。今は1つだけ:
//   family_unlink … 保護者が子どもとの連携を外したので、子どもの合言葉を無効にした
// アプリはこれを見て、端末の制限を止め・送信待ちを消し・ログイン画面で「連携が外れました」と知らせる（src/lib/session-core.ts）。
// 新しい code にしないのは、古いアプリが知らない code を internal と取り違え、401 でログアウトしなくなるため（code は unauthorized のまま）
export const UnauthorizedReason = z.enum(["family_unlink"]);
export type UnauthorizedReason = z.infer<typeof UnauthorizedReason>;

export const ApiError = z.object({
  code: ErrorCode,
  message: z.string(), // 何が起きたか（利用者に見せる文）
  hint: z.string(), // 次に何をすればよいか（利用者に見せる文）
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(), // bad_request の詳細（開発者向け）
  // unauthorized の理由（上の UnauthorizedReason）。知らない値は「理由なし」として読む（サーバが新しい理由を足しても、
  // 古いアプリが本文ごと読めなくなって 401 を internal と取り違えないように）
  reason: UnauthorizedReason.optional().catch(undefined),
});
export type ApiError = z.infer<typeof ApiError>;

export const errorStatus: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  upstream_failed: 502,
  timeout: 504,
  rate_limited: 429,
  unavailable: 503,
  network: 0,
  internal: 500,
};

// 既定の文。サーバは状況に合った文で上書きしてよい。
export const errorText: Record<ErrorCode, { message: string; hint: string }> = {
  bad_request: { message: "入力の内容を受け付けられませんでした", hint: "入力を見直して、もう一度送ってください" },
  unauthorized: { message: "ログインが確認できませんでした", hint: "もう一度 Google でログインしてください" },
  forbidden: { message: "この操作はできません", hint: "保護者の端末から操作してください" },
  not_found: { message: "見つかりませんでした", hint: "最初の画面からやり直してください" },
  conflict: { message: "すでに処理されています", hint: "画面を更新してください" },
  upstream_failed: { message: "外部のサービスが応答しませんでした", hint: "少し待ってから、もう一度押してください" },
  timeout: { message: "時間がかかりすぎて中断しました", hint: "もう一度押してください" },
  rate_limited: { message: "混み合っています", hint: "30秒ほど待ってから、もう一度押してください" },
  unavailable: { message: "ただいま使えません", hint: "少し待ってから、もう一度押してください" },
  network: { message: "通信できませんでした", hint: "接続を確認して、もう一度押してください" },
  internal: { message: "うまく処理できませんでした", hint: "もう一度押してください。続く場合は担当者に伝えてください" },
};
