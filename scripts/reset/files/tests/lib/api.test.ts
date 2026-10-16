// npm run kit:reset 後の状態: health だけで検査する。API を足したら、その API の呼び出しをここに足す（stream の API を足したら stream() の検査も）。
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

const health = { ok: true, mock: true };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("通信先", () => {
  it("EXPO_PUBLIC_API_URL があればそこへ送る（末尾の / は無視）", async () => {
    const { call } = await load("http://192.168.0.5:3000/");
    mockFetch(() => Response.json(health));
    await call("health");
    expect(calls[0]?.url).toBe("http://192.168.0.5:3000/api/health");
  });

  it("未設定なら Android エミュレータから見た PC（10.0.2.2）", async () => {
    const { call } = await load();
    mockFetch(() => Response.json(health));
    await call("health");
    expect(calls[0]?.url).toBe("http://10.0.2.2:3000/api/health");
  });
});

describe("call", () => {
  it("GET（health）は本文も Content-Type も付けず、返事を契約で検証して返す", async () => {
    const { call } = await load("http://h");
    mockFetch(() => Response.json(health));
    const r = await call("health");
    expect(r).toEqual(health);
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.body).toBeUndefined();
    expect(calls[0]?.init.headers).toBeUndefined();
  });

  it("契約と違う返事は例外にする", async () => {
    const { call } = await load("http://h");
    mockFetch(() => Response.json({ ok: false }));
    await expect(call("health")).rejects.toBeDefined();
  });

  it("HTTP エラーは ApiError の形を ApiCallError にして投げる", async () => {
    const { call, ApiCallError } = await load("http://h");
    mockFetch(() => Response.json({ code: "not_found", message: "m", hint: "h" }, { status: 404 }));
    const e = await call("health").catch((x) => x);
    expect(e).toBeInstanceOf(ApiCallError);
    expect(e.status).toBe(404);
    expect(e.error).toEqual({ code: "not_found", message: "m", hint: "h" });
  });

  it("形が読めない HTTP エラーは internal", async () => {
    const { call, errorOf } = await load("http://h");
    mockFetch(() => new Response("<html>", { status: 502 }));
    const e = await call("health").catch((x) => x);
    expect(errorOf(e)?.code).toBe("internal");
  });

  it("つながらないときは network", async () => {
    const { call, errorOf } = await load("http://h");
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Network request failed")));
    const e = await call("health").catch((x) => x);
    expect(errorOf(e)?.code).toBe("network");
  });
});
