// 通信クライアント（src/lib/api.ts）のテスト。サーバは起動せず、fetch を差し替えて「どこへ・どう送るか」「どう読むか」を確かめる。
import { afterEach, describe, expect, it, vi } from "vitest";

type Init = RequestInit & { signal?: AbortSignal };
const calls: { url: string; init: Init }[] = [];

function mockFetch(make: () => Response | Promise<Response>) {
  calls.length = 0;
  vi.stubGlobal("fetch", (url: string, init: Init) => {
    calls.push({ url, init });
    return Promise.resolve(make());
  });
}

// 環境変数を変えて api.ts を読み直す（通信先は読み込み時に決まる）
async function load(url?: string) {
  vi.resetModules();
  if (url === undefined) vi.stubEnv("EXPO_PUBLIC_API_URL", undefined);
  else vi.stubEnv("EXPO_PUBLIC_API_URL", url);
  return import("@/lib/api");
}

const rules = { childId: "c1", limits: [], updatedAt: "2026-10-17T00:00:00.000Z" };
const enc = new TextEncoder();
const streamOf = (parts: Uint8Array[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const p of parts) c.enqueue(p);
        c.close();
      },
    }),
  );
const lines = (...l: unknown[]) => enc.encode(`${l.map((x) => JSON.stringify(x)).join("\n")}\n`);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("通信先", () => {
  it("EXPO_PUBLIC_API_URL があればそこへ送る（末尾の / は無視）", async () => {
    const { call } = await load("http://192.168.0.5:3000/");
    mockFetch(() => Response.json(rules));
    await call("rulesGet", { childId: "c1" });
    expect(calls[0]?.url).toBe("http://192.168.0.5:3000/api/rules/get");
  });

  it("未設定なら Android エミュレータから見た PC（10.0.2.2）", async () => {
    const { call } = await load();
    mockFetch(() => Response.json(rules));
    await call("rulesGet", { childId: "c1" });
    expect(calls[0]?.url).toBe("http://10.0.2.2:3000/api/rules/get");
  });

  it("空（.env.example のまま）でも Android エミュレータから見た PC", async () => {
    const { call } = await load("");
    mockFetch(() => Response.json(rules));
    await call("rulesGet", { childId: "c1" });
    expect(calls[0]?.url).toBe("http://10.0.2.2:3000/api/rules/get");
  });
});

describe("合言葉", () => {
  it("setSessionToken で覚えると Authorization: Bearer が付き、null で外れる", async () => {
    const { call, setSessionToken } = await load();
    mockFetch(() => Response.json(rules));
    setSessionToken("t-123");
    await call("rulesGet", { childId: "c1" });
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe("Bearer t-123");
    setSessionToken(null);
    await call("rulesGet", { childId: "c1" });
    expect(new Headers(calls[1]?.init.headers).get("authorization")).toBeNull();
  });
});

describe("call", () => {
  it("POST は JSON 本文と Content-Type を付け、返事を契約で検証して返す", async () => {
    const { call } = await load("http://h");
    mockFetch(() => Response.json(rules));
    const r = await call("rulesGet", { childId: "c1" });
    expect(r).toEqual(rules);
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ childId: "c1" }));
    expect(calls[0]?.init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("GET（health）は本文も Content-Type も付けない", async () => {
    const { call } = await load("http://h");
    mockFetch(() => Response.json({ ok: true }));
    await call("health").catch(() => undefined);
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.body).toBeUndefined();
    expect(calls[0]?.init.headers).toBeUndefined();
  });

  it("契約と違う返事は例外にする", async () => {
    const { call } = await load("http://h");
    mockFetch(() => Response.json({ childId: 1 }));
    await expect(call("rulesGet", { childId: "c1" })).rejects.toBeDefined();
  });

  it("HTTP エラーは ApiError の形を ApiCallError にして投げる", async () => {
    const { call, ApiCallError } = await load("http://h");
    mockFetch(() => Response.json({ code: "not_found", message: "m", hint: "h" }, { status: 404 }));
    const e = await call("rulesGet", { childId: "c1" }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiCallError);
    expect(e.status).toBe(404);
    expect(e.error).toEqual({ code: "not_found", message: "m", hint: "h" });
  });

  it("形が読めない HTTP エラーは internal", async () => {
    const { call, errorOf } = await load("http://h");
    mockFetch(() => new Response("<html>", { status: 502 }));
    const e = await call("rulesGet", { childId: "c1" }).catch((x) => x);
    expect(errorOf(e)?.code).toBe("internal");
  });

  it("つながらないときは network", async () => {
    const { call, errorOf } = await load("http://h");
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Network request failed")));
    const e = await call("rulesGet", { childId: "c1" }).catch((x) => x);
    expect(errorOf(e)?.code).toBe("network");
  });
});

describe("stream", () => {
  const ok = { type: "done", data: rules };

  it("日本語が塊の途中で切れても欠けずに読み、chunk を順に渡して done の結果を返す", async () => {
    const { stream } = await load("http://h");
    const all = lines({ type: "chunk", data: { text: "こんにちは" } }, { type: "chunk", data: { text: "世界" } }, ok);
    const cut = 7; // 「こ」の途中（UTF-8 は1文字3バイト）で切る
    mockFetch(() => streamOf([all.slice(0, cut), all.slice(cut)]));
    const got: string[] = [];
    const r = await stream("rulesSyncStream", { childId: "c1" }, (c) => got.push(c.text));
    expect(got.join("")).toBe("こんにちは世界");
    expect(r).toEqual(rules);
    expect(calls[0]?.url).toBe("http://h/api/rules/sync-stream");
  });

  it("error の行は ApiCallError にする", async () => {
    const { stream } = await load("http://h");
    mockFetch(() => streamOf([lines({ type: "error", error: { code: "upstream_failed", message: "m", hint: "h" } })]));
    const e = await stream("rulesSyncStream", { childId: "c1" }, () => undefined).catch((x) => x);
    expect(e.error.code).toBe("upstream_failed");
  });

  it("done が来ないまま切れたら network", async () => {
    const { stream, errorOf } = await load("http://h");
    mockFetch(() => streamOf([lines({ type: "chunk", data: { text: "a" } })]));
    const e = await stream("rulesSyncStream", { childId: "c1" }, () => undefined).catch((x) => x);
    expect(errorOf(e)?.code).toBe("network");
  });
});
