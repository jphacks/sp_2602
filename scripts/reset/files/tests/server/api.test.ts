// 契約どおりに応答するかのテスト（lead の所有）。npm run kit:reset 後の状態: health と、エラー・クライアントの共通の仕組みだけを検査する。
// API を足したら、その API の「契約どおりの出力」「契約外の入力は 400」をここに足す。
import { api } from "@contracts/api";
import { ApiError } from "@contracts/errors";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { ApiCallError, call, errorOf } from "@/lib/api";
import { AppError } from "@/server/errors";
import { handle } from "@/server/route";

const get = () => new Request("http://test/api/health");

describe("json", () => {
  it("health は契約どおり", async () => {
    const res = await health(get());
    expect(api.health.res.safeParse(await res.json()).success).toBe(true);
  });
});

describe("エラーの契約", () => {
  it("AppError は対応するステータスと ApiError になる", async () => {
    const failing = handle("health", async () => {
      throw new AppError("upstream_failed");
    });
    const res = await failing(get());
    expect(res.status).toBe(502);
    expect(ApiError.parse(await res.json()).code).toBe("upstream_failed");
  });

  it("想定外の例外は internal（中身は漏らさない）", async () => {
    const failing = handle("health", async () => {
      throw new Error("secret detail");
    });
    const res = await failing(get());
    const body = ApiError.parse(await res.json());
    expect(res.status).toBe(500);
    expect(body.code).toBe("internal");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("サーバで network を投げても落ちず upstream_failed(502) になる", async () => {
    const failing = handle("health", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: 型で禁止しているコードを無理に渡す場合の検査
      throw new AppError("network" as any);
    });
    const res = await failing(get());
    expect(res.status).toBe(502);
    expect(ApiError.parse(await res.json()).code).toBe("upstream_failed");
  });

  it("errorOf: 自分で中断したら null、時間切れなら timeout", () => {
    expect(errorOf(new DOMException("aborted", "AbortError"))).toBeNull();
    expect(errorOf(new DOMException("timeout", "TimeoutError"))?.code).toBe("timeout");
  });
});

describe("クライアント（lib/api.ts）", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("call() は契約どおりの結果を返す", async () => {
    vi.stubGlobal("fetch", (path: string, init: RequestInit) => health(new Request(`http://test${path}`, init)));
    const r = await call("health");
    expect(r.ok).toBe(true);
  });

  it("call() の失敗は ApiCallError（message と hint つき）", async () => {
    const failing = handle("health", async () => {
      throw new AppError("upstream_failed");
    });
    vi.stubGlobal("fetch", (path: string, init: RequestInit) => failing(new Request(`http://test${path}`, init)));
    const e = await call("health").catch((x) => x);
    expect(e).toBeInstanceOf(ApiCallError);
    expect(e.error.code).toBe("upstream_failed");
    expect(e.error.hint).toBeTruthy();
  });

  it("通信できない時は network", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    const e = await call("health").catch((x) => x);
    expect(e.error.code).toBe("network");
  });
});
