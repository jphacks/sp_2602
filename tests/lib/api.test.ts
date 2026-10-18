// 通信クライアント（src/lib/api.ts）のテスト。サーバは起動せず、fetch を差し替えて「どこへ・どう送るか」「どう読むか」を確かめる。
import type { StreamDef } from "@contracts/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

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

// planGet の正しい返事の例
const planView = { childId: "c1", plan: null, usualLimitMinutes: null, configVersion: 0, childAppliedVersion: null };
// ストリームの仕組みを試すための、契約の表にない StreamDef（今はストリームの API がない）
const streamDef: StreamDef = {
  kind: "stream",
  method: "POST",
  path: "/api/test/stream",
  auth: "signedIn",
  req: z.object({ childId: z.string() }),
  chunk: z.object({ text: z.string() }),
  res: z.object({ done: z.boolean() }),
};
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
    mockFetch(() => Response.json(planView));
    await call("planGet", { childId: "c1" });
    expect(calls[0]?.url).toBe("http://192.168.0.5:3000/api/plan/get");
  });

  it("未設定なら Android エミュレータから見た PC（10.0.2.2）", async () => {
    const { call } = await load();
    mockFetch(() => Response.json(planView));
    await call("planGet", { childId: "c1" });
    expect(calls[0]?.url).toBe("http://10.0.2.2:3000/api/plan/get");
  });

  it("空（.env.example のまま）でも Android エミュレータから見た PC", async () => {
    const { call } = await load("");
    mockFetch(() => Response.json(planView));
    await call("planGet", { childId: "c1" });
    expect(calls[0]?.url).toBe("http://10.0.2.2:3000/api/plan/get");
  });
});

describe("call", () => {
  it("POST は JSON 本文と Content-Type を付け、返事を契約で検証して返す", async () => {
    const { call } = await load("http://h");
    mockFetch(() => Response.json(planView));
    const r = await call("planGet", { childId: "c1" });
    expect(r).toEqual(planView);
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
    await expect(call("planGet", { childId: "c1" })).rejects.toBeDefined();
  });

  it("HTTP エラーは ApiError の形を ApiCallError にして投げる", async () => {
    const { call, ApiCallError } = await load("http://h");
    mockFetch(() => Response.json({ code: "not_found", message: "m", hint: "h" }, { status: 404 }));
    const e = await call("planGet", { childId: "c1" }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiCallError);
    expect(e.status).toBe(404);
    expect(e.error).toEqual({ code: "not_found", message: "m", hint: "h" });
  });

  it("形が読めない HTTP エラーは internal", async () => {
    const { call, errorOf } = await load("http://h");
    mockFetch(() => new Response("<html>", { status: 502 }));
    const e = await call("planGet", { childId: "c1" }).catch((x) => x);
    expect(errorOf(e)?.code).toBe("internal");
  });

  it("HTML の 401 ではログアウト扱いにしない", async () => {
    const { call, errorOf, setSessionToken, setUnauthorizedHandler } = await load("http://h");
    const seen: string[] = [];
    setUnauthorizedHandler(() => seen.push("401"));
    setSessionToken("old");
    mockFetch(() => new Response("<html>", { status: 401 }));
    const e = await call("planGet", { childId: "c1" }).catch((x) => x);
    expect(errorOf(e)?.code).toBe("internal");
    expect(seen).toEqual([]);
  });

  it("つながらないときは network", async () => {
    const { call, errorOf } = await load("http://h");
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Network request failed")));
    const e = await call("planGet", { childId: "c1" }).catch((x) => x);
    expect(errorOf(e)?.code).toBe("network");
  });

  // 実機の通信（OkHttp）は既定で待ち時間の上限がない。応答が来ないと 30 秒ごとの取得が止まったままになるので、
  // signal を渡さなくても DEFAULT_TIMEOUT_MS で「時間切れ」にする
  it("signal を渡さなくても、応答が来なければ DEFAULT_TIMEOUT_MS で timeout にする", async () => {
    vi.useFakeTimers();
    try {
      const { call, errorOf, DEFAULT_TIMEOUT_MS } = await load("http://h");
      // 中断されるまで返事をしない fetch（電波の切り替えで応答が来ない状態）
      vi.stubGlobal(
        "fetch",
        (_url: string, init: Init) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      );
      const pending = call("planGet", { childId: "c1" }).catch((x) => x);
      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS - 1);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(errorOf(await pending)?.code).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("signal を渡したときは、その signal を使う（画面ごとの短い待ち時間を変えない）", async () => {
    const { call } = await load("http://h");
    mockFetch(() => Response.json(planView));
    const own = new AbortController();
    await call("planGet", { childId: "c1" }, { signal: own.signal });
    expect(calls[0]?.init.signal).toBe(own.signal);
  });
});

describe("stream", () => {
  const ok = { type: "done", data: { done: true } };

  it("日本語が塊の途中で切れても欠けずに読み、chunk を順に渡して done の結果を返す", async () => {
    const { streamRoute } = await load("http://h");
    const all = lines({ type: "chunk", data: { text: "こんにちは" } }, { type: "chunk", data: { text: "世界" } }, ok);
    const cut = 7; // 「こ」の途中（UTF-8 は1文字3バイト）で切る
    mockFetch(() => streamOf([all.slice(0, cut), all.slice(cut)]));
    const got: string[] = [];
    const r = await streamRoute(streamDef, { childId: "c1" }, (c) => got.push((c as { text: string }).text));
    expect(got.join("")).toBe("こんにちは世界");
    expect(r).toEqual({ done: true });
    expect(calls[0]?.url).toBe("http://h/api/test/stream");
  });

  it("error の行は ApiCallError にする", async () => {
    const { streamRoute } = await load("http://h");
    mockFetch(() => streamOf([lines({ type: "error", error: { code: "upstream_failed", message: "m", hint: "h" } })]));
    const { errorOf } = await import("@/lib/api");
    const e = await streamRoute(streamDef, { childId: "c1" }, () => undefined).catch((x) => x);
    expect(errorOf(e)?.code).toBe("upstream_failed");
  });

  it("done が来ないまま切れたら network", async () => {
    const { streamRoute, errorOf } = await load("http://h");
    mockFetch(() => streamOf([lines({ type: "chunk", data: { text: "a" } })]));
    const e = await streamRoute(streamDef, { childId: "c1" }, () => undefined).catch((x) => x);
    expect(errorOf(e)?.code).toBe("network");
  });
});

describe("合言葉", () => {
  it("setSessionToken で覚えた合言葉を Authorization に付ける。null で外す", async () => {
    const { call, setSessionToken } = await load("http://h");
    mockFetch(() => Response.json(planView));
    setSessionToken("tok");
    await call("planGet", { childId: "c1" });
    expect(((calls[0]?.init.headers ?? {}) as Record<string, string>).Authorization).toBe("Bearer tok");
    setSessionToken(null);
    await call("planGet", { childId: "c1" });
    expect(((calls[1]?.init.headers ?? {}) as Record<string, string>).Authorization).toBeUndefined();
  });

  it("合言葉を付けて unauthorized の 401 が返ったら、登録した関数を呼ぶ（session.tsx がログアウト扱いにする）", async () => {
    const { call, setSessionToken, setUnauthorizedHandler } = await load("http://h");
    const seen: string[] = [];
    setUnauthorizedHandler(() => seen.push("401"));
    mockFetch(() => Response.json({ code: "unauthorized", message: "m", hint: "h" }, { status: 401 }));
    setSessionToken("old");
    await call("planGet", { childId: "c1" }).catch(() => undefined);
    expect(seen).toEqual(["401"]);
    setSessionToken(null);
    setUnauthorizedHandler(null);
  });

  it("登録した関数には、サーバの返事（401 の理由 family_unlink も）を渡す。知らない理由は「理由なし」として読む（D-133）", async () => {
    const { call, setSessionToken, setUnauthorizedHandler } = await load("http://h");
    const seen: unknown[] = [];
    setUnauthorizedHandler((error) => seen.push(error.reason ?? null));
    setSessionToken("old");
    mockFetch(() =>
      Response.json({ code: "unauthorized", message: "m", hint: "h", reason: "family_unlink" }, { status: 401 }),
    );
    await call("planGet", { childId: "c1" }).catch(() => undefined);
    mockFetch(() =>
      Response.json({ code: "unauthorized", message: "m", hint: "h", reason: "future_reason" }, { status: 401 }),
    );
    await call("planGet", { childId: "c1" }).catch(() => undefined);
    expect(seen).toEqual(["family_unlink", null]);
    setSessionToken(null);
    setUnauthorizedHandler(null);
  });

  // 合言葉が無効になる（サーバが DB 版に替わる等）→ ログイン画面 → ログインし直した後に、前の合言葉で送っていた呼び出しの 401 が
  // 遅れて届いても、新しくログインした人をログアウトさせない
  it("前の合言葉で送った呼び出しの 401 が、ログインし直した後に届いても、登録した関数を呼ばない", async () => {
    const { call, setSessionToken, setUnauthorizedHandler } = await load("http://h");
    const seen: string[] = [];
    setUnauthorizedHandler(() => seen.push("401"));
    let reply: (r: Response) => void = () => {};
    vi.stubGlobal("fetch", () => new Promise<Response>((r) => (reply = r)));
    setSessionToken("old");
    const pending = call("planGet", { childId: "c1" }).catch((e: unknown) => e);
    setSessionToken("new"); // 待っている間にログインし直した
    reply(Response.json({ code: "unauthorized", message: "m", hint: "h" }, { status: 401 }));
    const err = await pending;
    expect((err as { status?: number }).status).toBe(401); // 呼んだ画面には 401 のエラーとして返す
    expect(seen).toEqual([]);
    setSessionToken(null);
    setUnauthorizedHandler(null);
  });

  it("isUnauthorized: 本文が読めない 401 も「合言葉が無効」とみなす（起動時に offline と取り違えない）", async () => {
    const { ApiCallError, isUnauthorized } = await load("http://h");
    expect(isUnauthorized(new ApiCallError({ code: "internal", message: "m", hint: "" }, 401))).toBe(true);
    expect(isUnauthorized(new ApiCallError({ code: "unauthorized", message: "m", hint: "" }, 401))).toBe(true);
    expect(isUnauthorized(new ApiCallError({ code: "network", message: "m", hint: "" }, 0))).toBe(false);
    expect(isUnauthorized(new ApiCallError({ code: "forbidden", message: "m", hint: "" }, 403))).toBe(false);
    expect(isUnauthorized(new Error("x"))).toBe(false);
  });

  // 合言葉は有効なまま、サーバ上の id・役割が変わる（#49: デモの人の合言葉は固定で id が uuid に）と、自分の設定の取得が 403 になる
  it("needsIdentityCheck: 403（forbidden）だけ、サーバに自分は誰かを確かめ直す", async () => {
    const { needsIdentityCheck } = await load("http://h");
    expect(needsIdentityCheck({ code: "forbidden", message: "m", hint: "" })).toBe(true);
    expect(needsIdentityCheck({ code: "network", message: "m", hint: "" })).toBe(false);
    expect(needsIdentityCheck({ code: "unauthorized", message: "m", hint: "" })).toBe(false); // 401 はログアウト扱い（別の道）
    expect(needsIdentityCheck(null)).toBe(false);
  });
});
