// 契約つきの Route Handler を作る（back の所有）。入力と出力の両方を contracts の Zod で検査し、
// 失敗はすべて contracts/errors.ts の ApiError の形で返す。
//   export const POST = handle("analyze", analyze);
//   export const POST = handleStream("analyzeStream", analyzeStream);
import "server-only";
import { api, type Chunk, type JsonRoute, type Req, type Res, type StreamDef, type StreamRoute } from "@contracts/api";
import { badRequest, toApiError } from "./errors";

async function readInput(request: Request, method: string): Promise<unknown> {
  if (method === "GET") return undefined;
  return request.json().catch(() => null);
}

export function handle<K extends JsonRoute>(name: K, fn: (req: Req<K>) => Promise<Res<K>>) {
  const route = api[name];
  return async (request: Request): Promise<Response> => {
    const parsed = route.req.safeParse(await readInput(request, route.method));
    if (!parsed.success) {
      const { status, body } = badRequest(parsed.error);
      return Response.json(body, { status });
    }
    try {
      const result = route.res.parse(await fn(parsed.data as Req<K>));
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
  fn: (req: Req<K>, emit: (chunk: Chunk<K>) => void, signal: AbortSignal) => Promise<Res<K>>,
) {
  const route = api[name] as unknown as StreamDef;
  return async (request: Request): Promise<Response> => {
    const parsed = route.req.safeParse(await readInput(request, route.method));
    if (!parsed.success) {
      const { status, body } = badRequest(parsed.error);
      return Response.json(body, { status });
    }
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        try {
          const emit = (chunk: Chunk<K>) => send({ type: "chunk", data: route.chunk.parse(chunk) });
          const result = route.res.parse(await fn(parsed.data as Req<K>, emit, request.signal));
          send({ type: "done", data: result });
        } catch (e) {
          send({ type: "error", error: toApiError(e).body });
        } finally {
          controller.close();
        }
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
