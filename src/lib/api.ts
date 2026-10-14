// 型付きクライアント（lead の所有）。画面はここ経由でだけサーバと通信する（パスを手書きしない）。
//   const r = await call("analyze", input);
//   const r = await stream("analyzeStream", input, (chunk) => setText((t) => t + chunk.text));
// 失敗は必ず ApiCallError で投げられる。画面は catch で setError(errorOf(e)) とし、message と hint を出せばよい。
// 中断: 時間制限は { signal: AbortSignal.timeout(ミリ秒) } → 「時間切れ」。
//       自分で止めた（画面を離れた等）は AbortController.abort() → errorOf が null を返すので何も出ない。
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
  if (e instanceof DOMException && e.name === "TimeoutError") return { code: "timeout", ...errorText.timeout };
  if (e instanceof DOMException && e.name === "AbortError") return null;
  return { code: "internal", ...errorText.internal };
}

async function send(path: string, method: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    // 自分で中断した（AbortError）・時間切れ（AbortSignal.timeout の TimeoutError）はそのまま渡し、errorOf() で見分ける
    if (e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError")) throw e;
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
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value;
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
