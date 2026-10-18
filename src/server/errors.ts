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
  } else if (pgCode(e) === "22P02") {
    // DB が「id の形が違う」（uuid でない文字列など）と断った。送られた値の誤りなので、サーバの不具合（500）にしない。
    // ふつうは処理の中で先に not_found・forbidden にしている（auth.ts の isUuid）。これは見落としたときの守り
    body = { code: "bad_request", ...errorText.bad_request };
  } else {
    console.error("[internal]", e);
    body = { code: "internal", ...errorText.internal };
  }
  return { status: errorStatus[body.code], body };
}

// Postgres のエラーの種類（SQLSTATE）。Drizzle は元のエラーを cause に包むので、両方を見る
function pgCode(e: unknown): string | null {
  for (let cur: unknown = e, depth = 0; cur && depth < 3; cur = (cur as { cause?: unknown }).cause, depth++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return null;
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
