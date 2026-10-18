// 契約つきの API の処理を作る。Web 標準の Request → Response の関数を返すので、どの Web フレームワークからも呼べる（src/server/app.ts が Hono につなぐ）。
// 入力と出力の両方を contracts の Zod で検査し、失敗はすべて contracts/errors.ts の ApiError の形で返す。
// 1回の流れ（json）:
//   1. 契約の auth（誰が呼べるか）を src/server/auth.ts で確かめる。**入力の検査より先**（ログインしていない人に入力の詳細を返さない）
//   2. 入力を読み、契約の Zod で検査する（だめなら 400 bad_request + issues）
//   3. 入力に childId があれば、呼んだ人がその子どもを扱えるかを確かめる（子どもは自分だけ・保護者は連携済みだけ。auth.ts の checkChildAccess）
//   4. 処理を呼び、出力も契約の Zod で検査する（合わなければ internal = サーバの不具合）
//   export default handle("planGet", async (req, { caller }) => …);
import {
  api,
  type Chunk,
  type JsonRoute,
  type Req,
  type Res,
  type StreamDef,
  type StreamRoute,
} from "../../contracts/api.js";
import { authorize, type Caller, checkChildAccess } from "./auth.js";
import { badRequest, toApiError } from "./errors.js";

// 処理に渡す、入力以外の情報。caller は auth が "none" の API でだけ null
export type Ctx = { caller: Caller | null };

// auth が "none" 以外の API の処理で、呼んだ人を取り出す（null なら route の設定の誤り）
export function callerOf(ctx: Ctx): Caller {
  if (!ctx.caller) throw new Error("caller がない（auth が none の API で callerOf を呼んだ）");
  return ctx.caller;
}

// 本文がない POST（入力なしの API。authSignOut）は undefined にする（契約の z.void() で受け付ける）。
// 本文があって JSON として読めなければ null（契約の検査で bad_request になる）
async function readInput(request: Request, method: string): Promise<unknown> {
  if (method === "GET") return undefined;
  const text = await request.text().catch(() => null);
  if (text == null) return null;
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const errorResponse = (e: unknown) => {
  const { status, body } = toApiError(e);
  return Response.json(body, { status });
};

// 1〜3 を済ませる。だめなら ApiError の Response を返す
async function prepare(
  route: { auth: StreamDef["auth"]; method: string; req: StreamDef["req"] },
  request: Request,
): Promise<Response | { ctx: Ctx; input: unknown }> {
  let ctx: Ctx;
  try {
    ctx = { caller: await authorize(route.auth, request) };
  } catch (e) {
    return errorResponse(e);
  }
  const parsed = route.req.safeParse(await readInput(request, route.method));
  if (!parsed.success) {
    const { status, body } = badRequest(parsed.error);
    return Response.json(body, { status });
  }
  try {
    await checkChildAccess(ctx.caller, parsed.data);
  } catch (e) {
    return errorResponse(e);
  }
  return { ctx, input: parsed.data };
}

export function handle<K extends JsonRoute>(name: K, fn: (req: Req<K>, ctx: Ctx) => Promise<Res<K>>) {
  const route = api[name];
  return async (request: Request): Promise<Response> => {
    const ready = await prepare(route, request);
    if (ready instanceof Response) return ready;
    try {
      const result = route.res.parse(await fn(ready.input as Req<K>, ready.ctx));
      return Response.json(result);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

// ストリーム（今は使う API がない。仕組みとテストのために残す）: fn の中で emit(chunk) を何回か呼び、最後に結果を return する。
// 送る形は1行1JSON（NDJSON）: {"type":"chunk","data":…} … {"type":"done","data":…}、失敗時は {"type":"error","error":…}
export function handleStream<K extends StreamRoute>(
  name: K,
  fn: (req: Req<K>, emit: (chunk: Chunk<K>) => void, signal: AbortSignal, ctx: Ctx) => Promise<Res<K>>,
) {
  return streamHandler(api[name] as unknown as StreamDef, fn as Parameters<typeof streamHandler>[1]);
}

// handleStream の中身。契約の表にない StreamDef でも使える（テストで仕組みを確かめるため）
export function streamHandler(
  route: StreamDef,
  fn: (req: unknown, emit: (chunk: unknown) => void, signal: AbortSignal, ctx: Ctx) => Promise<unknown>,
) {
  return async (request: Request): Promise<Response> => {
    // 流し始める前に 1〜3 を済ませる（流し始めると HTTP 200 のまま途中の error になってしまう）
    const ready = await prepare(route, request);
    if (ready instanceof Response) return ready;
    const encoder = new TextEncoder();
    // 画面が読むのをやめた（ページを離れた・中断した）ら、fn に渡す signal も止める。止めた後は何も書かない
    const cancelled = new AbortController();
    const signal = AbortSignal.any([request.signal, cancelled.signal]);
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (line: unknown) => {
          if (!signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        };
        try {
          const emit = (chunk: unknown) => send({ type: "chunk", data: route.chunk.parse(chunk) });
          const result = route.res.parse(await fn(ready.input, emit, signal, ready.ctx));
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
