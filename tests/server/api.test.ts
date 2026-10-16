// 契約どおりに応答するかのテスト（lead の担当）。
import { api, streamLine } from "@contracts/api";
import { ApiError } from "@contracts/errors";
import { fixtures } from "@contracts/fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as analyze } from "@/app/api/analyze/route";
import { POST as analyzeStream } from "@/app/api/analyze-stream/route";
import { GET as health } from "@/app/api/health/route";
import { ApiCallError, call, errorOf, stream } from "@/lib/api";
import { AppError } from "@/server/errors";
import { handle, handleStream } from "@/server/route";

process.env.MOCK_STREAM_DELAY_MS = "0";

const post = (body: unknown) =>
  new Request("http://test/api", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

describe("json", () => {
  it("health は契約どおり", async () => {
    const res = await health(new Request("http://test/api/health"));
    expect(api.health.res.safeParse(await res.json()).success).toBe(true);
  });

  it("analyze は契約どおりの出力を返す", async () => {
    const res = await analyze(post({ items: [{ id: "1", name: "x" }] }));
    expect(api.analyze.res.safeParse(await res.json()).success).toBe(true);
  });
});

describe("エラーの契約", () => {
  it("契約外の入力は 400 + ApiError(bad_request)", async () => {
    const res = await analyze(post({ items: [] }));
    expect(res.status).toBe(400);
    const body = ApiError.parse(await res.json());
    expect(body.code).toBe("bad_request");
    expect(body.issues?.length).toBeGreaterThan(0);
  });

  it("AppError は対応するステータスと ApiError になる", async () => {
    const failing = handle("analyze", async () => {
      throw new AppError("upstream_failed");
    });
    const res = await failing(post({ items: [{ id: "1", name: "x" }] }));
    expect(res.status).toBe(502);
    expect(ApiError.parse(await res.json()).code).toBe("upstream_failed");
  });

  it("想定外の例外は internal（中身は漏らさない）", async () => {
    const failing = handle("analyze", async () => {
      throw new Error("secret detail");
    });
    const res = await failing(post({ items: [{ id: "1", name: "x" }] }));
    const body = ApiError.parse(await res.json());
    expect(res.status).toBe(500);
    expect(body.code).toBe("internal");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("サーバで network を投げても落ちず upstream_failed(502) になる", async () => {
    const failing = handle("analyze", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: 型で禁止しているコードを無理に渡す場合の検査
      throw new AppError("network" as any);
    });
    const res = await failing(post({ items: [{ id: "1", name: "x" }] }));
    expect(res.status).toBe(502);
    expect(ApiError.parse(await res.json()).code).toBe("upstream_failed");
  });

  it("errorOf: 自分で中断したら null、時間切れなら timeout", () => {
    expect(errorOf(new DOMException("aborted", "AbortError"))).toBeNull();
    expect(errorOf(new DOMException("timeout", "TimeoutError"))?.code).toBe("timeout");
  });
});

describe("ストリーム", () => {
  it("1行ずつ chunk → 最後に done が契約どおりに届く", async () => {
    const res = await analyzeStream(post({ items: [{ id: "1", name: "x" }] }));
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const schema = streamLine(api.analyzeStream.chunk, api.analyzeStream.res);
    for (const l of lines) expect(schema.safeParse(l).success).toBe(true);
    expect(lines.filter((l) => l.type === "chunk")).toHaveLength(fixtures.analyzeStream.chunks.length);
    expect(lines.at(-1)?.type).toBe("done");
  });

  it("画面が読むのをやめたら、処理に渡した signal も止まり、その後は書かない", async () => {
    let seen: AbortSignal | undefined;
    let finished = () => {};
    const ended = new Promise<void>((r) => {
      finished = r;
    });
    const route = handleStream("analyzeStream", async (_req, emit, signal) => {
      seen = signal;
      emit({ text: "1" });
      await new Promise((r) => setTimeout(r, 20));
      emit({ text: "2" }); // 中断の後。閉じたストリームに書いて例外にならないこと
      finished();
      return fixtures.analyzeStream.res;
    });
    const res = await route(post({ items: [{ id: "1", name: "x" }] }));
    const reader = res.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    await ended;
    expect(seen?.aborted).toBe(true);
  });
});

describe("クライアント（lib/api.ts）", () => {
  afterEach(() => vi.unstubAllGlobals());
  // fetch を Route Handler に直結して、画面からの呼び出しを丸ごと試す
  const routes: Record<string, (r: Request) => Promise<Response>> = {
    "/api/analyze": analyze,
    "/api/analyze-stream": analyzeStream,
  };
  const stubFetch = () =>
    vi.stubGlobal("fetch", (path: string, init: RequestInit) => {
      const route = routes[path];
      if (!route) throw new Error(`no route ${path}`);
      return route(new Request(`http://test${path}`, init));
    });

  it("stream() は chunk を順に渡し、結果を返す", async () => {
    stubFetch();
    const got: string[] = [];
    const result = await stream("analyzeStream", { items: [{ id: "1", name: "x" }] }, (c) => got.push(c.text));
    expect(got).toEqual(fixtures.analyzeStream.chunks.map((c) => c.text));
    expect(result).toEqual(fixtures.analyzeStream.res);
  });

  it("call() の失敗は ApiCallError（message と hint つき）", async () => {
    stubFetch();
    const e = await call("analyze", { items: [] }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiCallError);
    expect(e.error.code).toBe("bad_request");
    expect(e.error.hint).toBeTruthy();
  });

  it("通信できない時は network", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    const e = await call("analyze", { items: [{ id: "1", name: "x" }] }).catch((x) => x);
    expect(e.error.code).toBe("network");
  });

  it("時間切れは network ではなく timeout", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new DOMException("timed out", "TimeoutError")));
    const e = await call("analyze", { items: [{ id: "1", name: "x" }] }).catch((x) => x);
    expect(errorOf(e)?.code).toBe("timeout");
  });
});
