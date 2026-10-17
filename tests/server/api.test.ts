// 契約どおりに応答するかのテスト（lead の担当）。サーバは Hono の app.request で、本物のネットワークを使わずに呼ぶ。
import { api, streamLine } from "@contracts/api";
import { ApiError } from "@contracts/errors";
import { fixtures, mockSessions } from "@contracts/fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiCallError, call, errorOf, setSessionToken, stream, timeoutSignal } from "@/lib/api";
import app from "@/server/app";
import { AppError } from "@/server/errors";
import { handle, handleStream } from "@/server/route";

process.env.MOCK_STREAM_DELAY_MS = "0";

// 合言葉（MOCK=1 の mockSessions）。API ごとの auth に合わせて付ける
const PARENT = mockSessions["mock-google-parent"].token;
const CHILD = mockSessions["mock-google-child"].token;
const NEW = mockSessions["mock-google-new"].token;

const json = (body: unknown, token: string | null = PARENT): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
});
const post = (body: unknown, token: string | null = PARENT) => new Request("http://test/api", json(body, token));
const child = { childId: "demo-child" };

describe("json", () => {
  it("health は契約どおり", async () => {
    const res = await app.request("/api/health");
    expect(api.health.res.safeParse(await res.json()).success).toBe(true);
  });

  it("rulesGet は契約どおりの出力を返す", async () => {
    const res = await app.request("/api/rules/get", json(child));
    expect(api.rulesGet.res.safeParse(await res.json()).success).toBe(true);
  });

  it("rulesSave は保存した内容を返す", async () => {
    const limits = [{ packageName: "com.example.app", label: "例", dailyMinutes: 15 }];
    const res = await app.request("/api/rules/save", json({ ...child, limits }));
    const body = api.rulesSave.res.parse(await res.json());
    expect(body.limits).toEqual(limits);
  });

  it("usageReport は送った内容を返す", async () => {
    const body = { ...child, date: "2026-10-17", apps: [{ packageName: "a.b", label: "A", usedMinutes: 5 }] };
    const res = await app.request("/api/usage/report", json(body, CHILD));
    const out = api.usageReport.res.parse(await res.json());
    expect(out.apps).toEqual(body.apps);
    expect(out.date).toBe(body.date);
  });

  it("usageGet は契約どおりの出力を返す", async () => {
    const res = await app.request("/api/usage/get", json(child));
    expect(api.usageGet.res.safeParse(await res.json()).success).toBe(true);
  });

  it("契約のすべての API が app につながっている", async () => {
    for (const route of Object.values(api)) {
      const res = await app.request(route.path, route.method === "GET" ? undefined : json({}));
      expect(res.status, `${route.method} ${route.path}`).not.toBe(404);
    }
  });

  it("契約にない道筋は 404 + ApiError(not_found)", async () => {
    const res = await app.request("/api/nothing");
    expect(res.status).toBe(404);
    expect(ApiError.parse(await res.json()).code).toBe("not_found");
  });
});

describe("ログインと合言葉（層1）", () => {
  it("authGoogle は MOCK の idToken から合言葉つきの Session を返す", async () => {
    const res = await app.request("/api/auth/google", json({ idToken: "mock-google-parent" }, null));
    expect(api.authGoogle.res.parse(await res.json())).toEqual(mockSessions["mock-google-parent"]);
  });

  it("authGoogle は知らない idToken を 401(unauthorized) にする", async () => {
    const res = await app.request("/api/auth/google", json({ idToken: "nobody" }, null));
    expect(res.status).toBe(401);
    expect(ApiError.parse(await res.json()).code).toBe("unauthorized");
  });

  it("authMe は合言葉の持ち主を返す。ペアリング前の人は role が null", async () => {
    const res = await app.request("/api/auth/me", { headers: { Authorization: `Bearer ${NEW}` } });
    const me = api.authMe.res.parse(await res.json());
    expect(me.userId).toBe("demo-new");
    expect(me.role).toBeNull();
  });

  it("合言葉なしでルールを保存しようとすると 401(unauthorized)", async () => {
    const limits = [{ packageName: "com.example.app", label: "例", dailyMinutes: 15 }];
    const res = await app.request("/api/rules/save", json({ ...child, limits }, null));
    expect(res.status).toBe(401);
    expect(ApiError.parse(await res.json()).code).toBe("unauthorized");
  });

  it("でたらめな合言葉も 401(unauthorized)", async () => {
    const res = await app.request("/api/rules/get", json(child, "not-a-token"));
    expect(res.status).toBe(401);
  });

  it("子どもの合言葉でルールを保存しようとすると 403(forbidden)", async () => {
    const res = await app.request("/api/rules/save", json({ ...child, limits: [] }, CHILD));
    expect(res.status).toBe(403);
    expect(ApiError.parse(await res.json()).code).toBe("forbidden");
  });

  it("ペアリング前の人は保護者の操作も子どもの操作もできない（403）", async () => {
    const save = await app.request("/api/rules/save", json({ ...child, limits: [] }, NEW));
    const report = await app.request("/api/usage/report", json({ ...child, date: "2026-10-17", apps: [] }, NEW));
    expect([save.status, report.status]).toEqual([403, 403]);
  });

  it("保護者の合言葉で使用状況を送ろうとすると 403(forbidden)", async () => {
    const body = { ...child, date: "2026-10-17", apps: [] };
    const res = await app.request("/api/usage/report", json(body, PARENT));
    expect(res.status).toBe(403);
  });

  it("合言葉の確認は入力の検査より先（ログインしていない人に入力の詳細を返さない）", async () => {
    const res = await app.request("/api/rules/get", json({ childId: "" }, null));
    expect(res.status).toBe(401);
  });

  it("契約のすべての API に auth がある", () => {
    for (const [name, route] of Object.entries(api))
      expect(["none", "signedIn", "parent", "child"], `${name} の auth`).toContain(route.auth);
  });
});

describe("エラーの契約", () => {
  it("契約外の入力は 400 + ApiError(bad_request)", async () => {
    const res = await app.request("/api/rules/get", json({ childId: "" }));
    expect(res.status).toBe(400);
    const body = ApiError.parse(await res.json());
    expect(body.code).toBe("bad_request");
    expect(body.issues?.length).toBeGreaterThan(0);
  });

  it("AppError は対応するステータスと ApiError になる", async () => {
    const failing = handle("rulesGet", async () => {
      throw new AppError("upstream_failed");
    });
    const res = await failing(post(child));
    expect(res.status).toBe(502);
    expect(ApiError.parse(await res.json()).code).toBe("upstream_failed");
  });

  it("想定外の例外は internal（中身は漏らさない）", async () => {
    const failing = handle("rulesGet", async () => {
      throw new Error("secret detail");
    });
    const res = await failing(post(child));
    const body = ApiError.parse(await res.json());
    expect(res.status).toBe(500);
    expect(body.code).toBe("internal");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("サーバで network を投げても落ちず upstream_failed(502) になる", async () => {
    const failing = handle("rulesGet", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: 型で禁止しているコードを無理に渡す場合の検査
      throw new AppError("network" as any);
    });
    const res = await failing(post(child));
    expect(res.status).toBe(502);
    expect(ApiError.parse(await res.json()).code).toBe("upstream_failed");
  });

  it("errorOf: 自分で中断したら null、想定外は internal", () => {
    expect(errorOf(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBeNull();
    expect(errorOf(new Error("x"))?.code).toBe("internal");
  });
});

describe("ストリーム", () => {
  it("1行ずつ chunk → 最後に done が契約どおりに届く", async () => {
    const res = await app.request("/api/rules/sync-stream", json(child));
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const schema = streamLine(api.rulesSyncStream.chunk, api.rulesSyncStream.res);
    for (const l of lines) expect(schema.safeParse(l).success).toBe(true);
    expect(lines.filter((l) => l.type === "chunk")).toHaveLength(fixtures.rulesSyncStream.chunks.length);
    expect(lines.at(-1)?.type).toBe("done");
  });

  it("アプリが読むのをやめたら、処理に渡した signal も止まり、その後は書かない", async () => {
    let seen: AbortSignal | undefined;
    let finished = () => {};
    const ended = new Promise<void>((r) => {
      finished = r;
    });
    const route = handleStream("rulesSyncStream", async (_req, emit, signal) => {
      seen = signal;
      emit({ text: "1" });
      await new Promise((r) => setTimeout(r, 20));
      emit({ text: "2" }); // 中断の後。閉じたストリームに書いて例外にならないこと
      finished();
      return fixtures.rulesSyncStream.res;
    });
    const res = await route(post(child));
    const reader = res.body?.getReader();
    await reader?.read();
    await reader?.cancel();
    await ended;
    expect(seen?.aborted).toBe(true);
  });
});

describe("クライアント（lib/api.ts）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setSessionToken(null);
  });
  // fetch をサーバ（Hono の app）に直結して、アプリからの呼び出しを丸ごと試す
  const stubFetch = () =>
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => app.request(new URL(url).pathname, init));

  it("ログインで受け取った合言葉を覚えると、以降の call() に付く", async () => {
    stubFetch();
    const session = await call("authGoogle", { idToken: "mock-google-parent" });
    setSessionToken(session.token);
    expect((await call("authMe")).role).toBe("parent");
  });

  it("合言葉を覚えていない call() は unauthorized", async () => {
    stubFetch();
    const e = await call("rulesGet", child).catch((x) => x);
    expect(e.error.code).toBe("unauthorized");
  });

  it("stream() は chunk を順に渡し、結果を返す", async () => {
    stubFetch();
    setSessionToken(PARENT);
    const got: string[] = [];
    const result = await stream("rulesSyncStream", child, (c) => got.push(c.text));
    expect(got).toEqual(fixtures.rulesSyncStream.chunks.map((c) => c.text));
    expect(result).toEqual({ ...fixtures.rulesSyncStream.res, childId: child.childId });
  });

  it("call() の失敗は ApiCallError（message と hint つき）", async () => {
    stubFetch();
    setSessionToken(PARENT);
    const e = await call("rulesGet", { childId: "" }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiCallError);
    expect(e.error.code).toBe("bad_request");
    expect(e.error.hint).toBeTruthy();
  });

  it("通信できない時は network", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    const e = await call("rulesGet", child).catch((x) => x);
    expect(e.error.code).toBe("network");
  });

  it("時間切れ（timeoutSignal）は network ではなく timeout", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    const e = await call("rulesGet", child, { signal: timeoutSignal(10) }).catch((x) => x);
    expect(errorOf(e)?.code).toBe("timeout");
  });

  it("自分で中断したら何も出ない（errorOf が null）", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    );
    const controller = new AbortController();
    const pending = call("rulesGet", child, { signal: controller.signal }).catch((x) => x);
    controller.abort();
    expect(errorOf(await pending)).toBeNull();
  });
});
