// 契約つきの API の処理を作る（lead の担当）。Web 標準の Request → Response の関数を返すので、どの Web フレームワークからも呼べる（src/server/app.ts が Hono につなぐ）。入力と出力の両方を contracts の Zod で検査し、
// 失敗はすべて contracts/errors.ts の ApiError の形で返す。
// 入力を読む前に、契約の auth（誰が呼べるか）を src/server/auth.ts で確かめる。呼んだ人は ctx.caller で処理に渡る。
//   export default handle("rulesGet", async (req, { caller }) => …);
//   export default handleStream("rulesSyncStream", async (req, emit, signal, { caller }) => …);
import {
  api,
  type Chunk,
  type JsonRoute,
  type Req,
  type Res,
  type StreamDef,
  type StreamRoute,
} from "../../contracts/api";
import { authorize, type Caller, checkOwnChild } from "./auth";
import { badRequest, toApiError } from "./errors";

// 処理に渡す、入力以外の情報。caller は auth が "none" の API でだけ null
export type Ctx = { caller: Caller | null };

async function readInput(request: Request, method: string): Promise<unknown> {
  if (method === "GET") return undefined;
  return request.json().catch(() => null);
}

// 認可に失敗したら、その ApiError の Response を返す（成功なら ctx）
async function contextOf(rule: (typeof api)[keyof typeof api]["auth"], request: Request): Promise<Ctx | Response> {
  try {
    return { caller: await authorize(rule, request) };
  } catch (e) {
    const { status, body } = toApiError(e);
    return Response.json(body, { status });
  }
}

export function handle<K extends JsonRoute>(name: K, fn: (req: Req<K>, ctx: Ctx) => Promise<Res<K>>) {
  const route = api[name];
  return async (request: Request): Promise<Response> => {
    const ctx = await contextOf(route.auth, request);
    if (ctx instanceof Response) return ctx;
    const parsed = route.req.safeParse(await readInput(request, route.method));
    if (!parsed.success) {
      const { status, body } = badRequest(parsed.error);
      return Response.json(body, { status });
    }
    try {
      checkOwnChild(ctx.caller, parsed.data);
      const result = route.res.parse(await fn(parsed.data as Req<K>, ctx));
      return Response.json(result);
    } catch (e) {
      const { status, body } = toApiError(e);
      return Response.json(body, { status });
    }
  };
}

// ストリーム: fn の中で emit(chunk) を何回か呼び、最後に結果を return する。
// 送る形は1行1JSON（NDJSON）: {"type":"chunk","data":…} … {"type":"done","data":…}、失敗時は {"type":"error","error":…}
export function handleStream<K extends StreamRoute>(
  name: K,
  fn: (req: Req<K>, emit: (chunk: Chunk<K>) => void, signal: AbortSignal, ctx: Ctx) => Promise<Res<K>>,
) {
  const route = api[name] as unknown as StreamDef;
  return async (request: Request): Promise<Response> => {
    const ctx = await contextOf(route.auth, request);
    if (ctx instanceof Response) return ctx;
    const parsed = route.req.safeParse(await readInput(request, route.method));
    if (!parsed.success) {
      const { status, body } = badRequest(parsed.error);
      return Response.json(body, { status });
    }
    // 流し始める前に確かめる（流し始めると HTTP 200 のまま途中の error になってしまう）
    try {
      checkOwnChild(ctx.caller, parsed.data);
    } catch (e) {
      const { status, body } = toApiError(e);
      return Response.json(body, { status });
    }
    const encoder = new TextEncoder();
    // 画面が読むのをやめた（ページを離れた・中断した）ら、fn に渡す signal も止める。止めた後は何も書かない
    // （以前は処理が最後まで続き、閉じたストリームに書いて例外になっていた: レビュー指摘）
    const cancelled = new AbortController();
    const signal = AbortSignal.any([request.signal, cancelled.signal]);
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (line: unknown) => {
          if (!signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        };
        try {
          const emit = (chunk: Chunk<K>) => send({ type: "chunk", data: route.chunk.parse(chunk) });
          const result = route.res.parse(await fn(parsed.data as Req<K>, emit, signal, ctx));
          send({ type: "done", data: result });
        } catch (e) {
          send({ type: "error", error: toApiError(e).body });
        } finally {
          if (!signal.aborted) controller.close();
        }
      },
      cancel() {
        cancelled.abort();
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  };
}
