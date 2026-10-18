// サーバ側のエラー（lead の担当）。処理の中では AppError を throw し、形の変換は route.ts に任せる。
//   throw new AppError("upstream_failed");                       // 既定の文
//   throw new AppError("not_found", "その結果は見つかりません");   // 文を上書き
//   throw new AppError("unauthorized", 文, 次にすること, "family_unlink"); // 401 の理由を付ける（D-133。auth.ts の authorize だけ）

import { ZodError } from "zod";
import {
  type ApiError,
  type ErrorCode,
  errorStatus,
  errorText,
  type UnauthorizedReason,
} from "../../contracts/errors.js";

// "network" はクライアントが「サーバに届かなかった」ときにだけ作る。サーバから外部APIに繋がらないときは "upstream_failed"。
export type ServerErrorCode = Exclude<ErrorCode, "network">;

export class AppError extends Error {
  constructor(
    readonly code: ServerErrorCode,
    message?: string,
    readonly hint?: string,
    readonly reason?: UnauthorizedReason,
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
    // 理由は unauthorized のときだけ返す（ほかの code に付けても意味がないので落とす）
    if (code === "unauthorized" && e.reason) body.reason = e.reason;
  } else if (e instanceof ZodError) {
    // 入力の検査は route.ts で先に済むので、ここに来るのは「出力が契約と合わない」= サーバの不具合
    console.error(
      "[契約違反] サーバの出力が契約と合いません",
      e.issues.map((i) => ({ path: i.path.join("."), code: i.code })),
    );
    body = { code: "internal", ...errorText.internal };
  } else if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
    body = { code: "timeout", ...errorText.timeout };
  } else if (isDatabaseUnavailable(e)) {
    // DB につながらない（止まっている・接続が切れた・閉じた）。サーバの不具合（500）ではなく、一時的に使えない（503）として返す。
    // 中身（SQL・接続先）は返さずに記録だけする（セキュリティ検査 AVL-04）
    console.error("[unavailable] DB につながりません", describeError(e));
    body = { code: "unavailable", ...errorText.unavailable };
  } else if (pgCode(e) === "22P02") {
    // DB が「id の形が違う」（uuid でない文字列など）と断った。送られた値の誤りなので、サーバの不具合（500）にしない。
    // ふつうは処理の中で先に not_found・forbidden にしている（auth.ts の isUuid）。これは見落としたときの守り
    body = { code: "bad_request", ...errorText.bad_request };
  } else {
    console.error("[internal]", describeError(e));
    body = { code: "internal", ...errorText.internal };
  }
  return { status: errorStatus[body.code], body };
}

// ログに出してよい、エラーの要約。種類（name）・コード（SQLSTATE・errno）・どこで起きたか（stack の場所の行）だけ。
// message は出さない（なぜ: Drizzle の失敗は message に SQL と params = 利用者の入力・利用者 ID をそのまま含み、
// 入力の改行でログの行を偽装できた。セキュリティ検査 F-4 / IN-12）。
// 包まれた元のエラー（cause）の場所も出す（DB を開けなかったときなど、包んだ側の場所だけでは原因が分からないため）
export function describeError(e: unknown): string {
  const parts: string[] = [];
  const at: string[] = [];
  for (let cur: unknown = e, depth = 0; cur && depth < 4; cur = (cur as { cause?: unknown }).cause, depth++) {
    const name = cur instanceof Error ? cur.name : typeof cur;
    const code = (cur as { code?: unknown }).code;
    parts.push(typeof code === "string" && /^[0-9A-Z_]{1,20}$/.test(code) ? `${name}(${code})` : name);
    const frames = stackFrames(cur).slice(0, depth === 0 ? 3 : 2);
    at.push(...(depth === 0 ? frames : frames.map((line) => `cause ${line}`)));
  }
  return [parts.join(" <- "), ...at].join(" | ");
}

// stack の場所の行（"at ..."）。stack の頭は「種類: message」なので、message の中の行は場所として拾わない
//   なぜ: 前は stack の頭から /^\s+at / に合う行を拾ったので、message に「改行＋空白＋at 」があると
//   （Drizzle の失敗の params = 利用者の入力）、その入力が場所の行としてログに出た。
//   message が stack の中に見つからない（stack を読んだ後で message を書きかえた）ときは、場所を出さない（入力を出すよりよい）
function stackFrames(e: unknown): string[] {
  if (!(e instanceof Error) || typeof e.stack !== "string") return [];
  const message = String(e.message);
  const start = e.stack.indexOf(message);
  if (start < 0) return [];
  return e.stack
    .slice(start + message.length)
    .split(/\r\n|\r|\n/)
    .filter((line) => /^\s+at /.test(line))
    .map((line) => line.trim().replace(/\p{Cc}/gu, ""));
}

// Postgres のエラーの種類（SQLSTATE）。Drizzle は元のエラーを cause に包むので、両方を見る
function pgCode(e: unknown): string | null {
  for (let cur: unknown = e, depth = 0; cur && depth < 3; cur = (cur as { cause?: unknown }).cause, depth++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return null;
}

// DB につながらず開けなかった（src/server/db/index.ts が、開くときの失敗のうち接続の失敗だけをこれで包む。
// 設定の欠落・マイグレーションの誤りは包まず 500 internal にする）
export class DatabaseUnavailableError extends Error {
  override name = "DatabaseUnavailableError";
}

// DB につながらないときのエラーか。Postgres の SQLSTATE（08xxx 接続の失敗・57P01〜57P03 停止中・53300 接続が多すぎる）、
// Node の通信のエラー（接続を断られた・切れた・時間切れ・名前が引けない）、手元の DB（PGlite）が閉じている、を見る。
// Drizzle・ドライバは元のエラーを cause に包むので、少し奥まで見る
const UNAVAILABLE_SQLSTATE = /^(08...|57P0[123]|53300)$/;
const UNAVAILABLE_ERRNO = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE"]);

export function isDatabaseUnavailable(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && depth < 4; cur = (cur as { cause?: unknown }).cause, depth++) {
    const code = (cur as { code?: unknown }).code;
    if (cur instanceof DatabaseUnavailableError) return true;
    if (typeof code === "string" && (UNAVAILABLE_SQLSTATE.test(code) || UNAVAILABLE_ERRNO.has(code))) return true;
    if (cur instanceof Error && cur.message === "PGlite is closed") return true;
  }
  return false;
}

// 入力の誤り（Zod の検査の前に断るとき）。issues には入力の値を入れない
export function badRequestOf(message: string): { status: number; body: ApiError } {
  return { status: 400, body: { code: "bad_request", ...errorText.bad_request, issues: [{ path: "", message }] } };
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
