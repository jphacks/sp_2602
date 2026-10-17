// サーバ側のエラー（lead の担当）。処理の中では AppError を throw し、形の変換は route.ts に任せる。
//   throw new AppError("upstream_failed");                       // 既定の文
//   throw new AppError("not_found", "その結果は見つかりません");   // 文を上書き

import { ZodError } from "zod";
import { type ApiError, type ErrorCode, errorStatus, errorText } from "../../contracts/errors.js";

// "network" はクライアントが「サーバに届かなかった」ときにだけ作る。サーバから外部APIに繋がらないときは "upstream_failed"。
export type ServerErrorCode = Exclude<ErrorCode, "network">;

export class AppError extends Error {
  constructor(
    readonly code: ServerErrorCode,
    message?: string,
    readonly hint?: string,
  ) {
    super(message ?? errorText[code].message);
  }
}

export function toApiError(e: unknown): { status: number; body: ApiError } {
  let body: ApiError;
  if (e instanceof AppError) {
    // 型を無視して "network" が来ても、HTTP ステータス 0 では返せないので upstream_failed に寄せる
    const code: ServerErrorCode = (e.code as ErrorCode) === "network" ? "upstream_failed" : e.code;
    body = { code, message: e.message, hint: e.hint ?? errorText[code].hint };
  } else if (e instanceof ZodError) {
    // 入力の検査は route.ts で先に済むので、ここに来るのは「出力が契約と合わない」= サーバの不具合
    console.error("[契約違反] サーバの出力が契約と合いません", e.issues);
    body = { code: "internal", ...errorText.internal };
  } else if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
    body = { code: "timeout", ...errorText.timeout };
  } else {
    console.error("[internal]", e);
    body = { code: "internal", ...errorText.internal };
  }
  return { status: errorStatus[body.code], body };
}

export function badRequest(error: ZodError): { status: number; body: ApiError } {
  return {
    status: 400,
    body: {
      code: "bad_request",
      ...errorText.bad_request,
      issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    },
  };
}
