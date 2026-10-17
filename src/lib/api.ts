// 型付きクライアント（lead の担当）。画面はここ経由でだけサーバと通信する（パスを手書きしない）。
//   const r = await call("rulesGet", { childId });
//   const r = await stream("rulesSyncStream", { childId }, (chunk) => setText((t) => t + chunk.text));
// 失敗は必ず ApiCallError で投げられる。画面は catch で setError(errorOf(e)) とし、message と hint を出せばよい。
// つなぎ先は環境変数 EXPO_PUBLIC_API_URL（.env に書く）。未設定なら Android エミュレータから見た手元の PC（http://10.0.2.2:3000）。
//   実機で試すときは、PC の LAN の IP（例 http://192.168.0.5:3000）を .env に書く（同じ Wi-Fi につなぐ）。
// 中断: 時間制限は { signal: timeoutSignal(ミリ秒) } → 「時間切れ」。
//       自分で止めた（画面を離れた等）は AbortController.abort() → errorOf が null を返すので何も出ない。
// fetch は expo/fetch（少しずつ届く応答を読める。標準の fetch は React Native では読めない）を使う。
// 合言葉: ログイン（call("authGoogle", …)）で受け取った Session の token を setSessionToken() で覚えると、
//   以降の call() / stream() が Authorization: Bearer <token> を付ける。端末への保存は Kotlin 側（層3）。
import {
  api,
  type Chunk,
  type JsonRoute,
  type Req,
  type Res,
  type StreamDef,
  type StreamRoute,
  streamLine,
} from "@contracts/api";
import { ApiError, errorText } from "@contracts/errors";
import { fetch } from "expo/fetch";

// .env.example の `EXPO_PUBLIC_API_URL=`（空）は "" として埋め込まれるので、?? ではなく || で「空も未設定」とみなす
const BASE_URL = (process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:3000").replace(/\/$/, "");

// 時間切れで止めた signal を覚えておく（fetch が「時間切れ」か「自分で中断」かを区別できない実装でも見分けるため）
const timedOut = new WeakSet<AbortSignal>();

// 指定ミリ秒で中断する signal（AbortSignal.timeout は React Native にない場合があるので、自前で作る）
export function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => {
    timedOut.add(controller.signal);
    controller.abort();
  }, ms);
  return controller.signal;
}

let sessionToken: string | null = null;

// ログインしたら合言葉を覚える（ログアウト・合言葉が無効になったら null）
export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === "AbortError";

export class ApiCallError extends Error {
  constructor(
    readonly error: ApiError,
    readonly status: number,
  ) {
    super(error.message);
  }
}

// どんな例外でも画面に出せる形にする。自分で中断した場合だけ null（エラー表示しない）
export function errorOf(e: unknown): ApiError | null {
  if (e instanceof ApiCallError) return e.error;
  if (isAbort(e)) return null;
  return { code: "internal", ...errorText.internal };
}

async function send(path: string, method: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      signal,
      headers: Object.keys(headers).length ? headers : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    // 時間切れ（timeoutSignal）は timeout、自分で中断した（AbortError）はそのまま渡して errorOf() が null にする
    if (signal && timedOut.has(signal)) throw new ApiCallError({ code: "timeout", ...errorText.timeout }, 0);
    if (isAbort(e)) throw e;
    throw new ApiCallError({ code: "network", ...errorText.network }, 0);
  }
  if (!res.ok) {
    const parsed = ApiError.safeParse(await res.json().catch(() => null));
    throw new ApiCallError(parsed.success ? parsed.data : { code: "internal", ...errorText.internal }, res.status);
  }
  return res;
}

export async function call<K extends JsonRoute>(
  name: K,
  body?: Req<K>,
  opts: { signal?: AbortSignal } = {},
): Promise<Res<K>> {
  const r = api[name];
  const res = await send(r.path, r.method, body, opts.signal);
  return r.res.parse(await res.json()) as Res<K>;
}

export async function stream<K extends StreamRoute>(
  name: K,
  body: Req<K>,
  onChunk: (chunk: Chunk<K>) => void,
  opts: { signal?: AbortSignal } = {},
): Promise<Res<K>> {
  const r = api[name] as unknown as StreamDef;
  const res = await send(r.path, r.method, body, opts.signal);
  if (!res.body) throw new ApiCallError({ code: "internal", ...errorText.internal }, res.status);

  const line = streamLine(r.chunk, r.res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder(); // 日本語が2つの塊にまたがっても欠けないよう、stream: true で少しずつ読む
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const msg = line.parse(JSON.parse(raw));
      if (msg.type === "chunk") onChunk(msg.data as Chunk<K>);
      else if (msg.type === "done") return msg.data as Res<K>;
      else throw new ApiCallError(msg.error, res.status);
    }
    if (done) break;
  }
  throw new ApiCallError({ code: "network", ...errorText.network }, 0); // done が来ないまま切れた
}
