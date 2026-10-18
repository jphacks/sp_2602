// DB につながらないときの API の返事と、そのあとの戻り方（セキュリティ検査 AVL-04）。
// 前は手元の DB（PGlite）を閉じると、/api/health もログインが要る API も 500 internal を返し、閉じた DB を使い続けていた。
// 今は: 一時的に使えない 503 unavailable を返し（SQL・スタックは返さない）、DB が開ければ次の呼び出しで元に戻る。
// 開けない理由が接続ではない（DATABASE_URL がない・マイグレーションの誤りなど）ときは 503 にせず 500 internal（ログに原因の場所を出す）
import { errorText } from "@contracts/errors";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeDatabaseClientForTests } from "@/server/db";
import { DatabaseUnavailableError, isDatabaseUnavailable, toApiError } from "@/server/errors";
import { CHILD_ID, fresh, get, ok, PARENT, post } from "../verify/helpers";

const NOW = "2026-10-15T03:00:00.000Z";
const template = process.env.SLOPE_TEST_PGLITE_TEMPLATE;

afterEach(() => {
  process.env.SLOPE_TEST_PGLITE_TEMPLATE = template;
  vi.doUnmock("drizzle-orm/pglite/migrator");
  vi.restoreAllMocks();
});

const usage = () => post("/api/usage/get", { childId: CHILD_ID, from: "2026-10-12", to: "2026-10-18" }, PARENT);

describe("DB につながらないエラーの見分け", () => {
  it("Postgres の接続の失敗・停止中・Node の通信のエラー・閉じた PGlite・開けなかった DB は 503 unavailable", () => {
    const closed = new Error("PGlite is closed");
    for (const e of [
      closed,
      new Error("query failed", { cause: closed }),
      Object.assign(new Error("connection failure"), { code: "08006" }),
      Object.assign(new Error("the database system is shutting down"), { code: "57P03" }),
      new Error("query failed", { cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }) }),
      new DatabaseUnavailableError("DB を開けませんでした"),
    ]) {
      expect(isDatabaseUnavailable(e), String(e)).toBe(true);
      expect(toApiError(e)).toEqual({ status: 503, body: { code: "unavailable", ...errorText.unavailable } });
    }
  });

  it("それ以外のエラーは今までどおり（形の誤り 22P02 は 400・そのほかは 500）", () => {
    expect(isDatabaseUnavailable(new Error("boom"))).toBe(false);
    expect(toApiError(new Error("boom")).status).toBe(500);
    expect(toApiError(Object.assign(new Error("bad uuid"), { code: "22P02" })).status).toBe(400);
  });
});

describe("DB が閉じた・開けないときの API（AVL-04）", () => {
  it("閉じた DB は次の呼び出しで開き直す（health は 200 に戻る）", async () => {
    await fresh(NOW);
    await closeDatabaseClientForTests();
    expect(await ok(get("/api/health", null))).toMatchObject({ ok: true });
    await ok(usage());
  });

  it("開き直せない間、接続の失敗なら health もログインが要る API も 503 unavailable（中身は返さない）。開ければ 200 に戻る", async () => {
    await fresh(NOW);
    await closeDatabaseClientForTests();
    // 開くとき（マイグレーション）に接続を断られたことにする。作りかけの PGlite は閉じてから捨てる
    const made: { closed: boolean }[] = [];
    vi.doMock("drizzle-orm/pglite/migrator", () => ({
      migrate: async (local: { $client: { closed: boolean } }) => {
        made.push(local.$client);
        throw new Error("connect", { cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }) });
      },
    }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    for (const res of [await get("/api/health", null), await usage()]) {
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body).toEqual({ code: "unavailable", ...errorText.unavailable });
    }
    expect(made.length).toBeGreaterThan(0);
    expect(made.every((client) => client.closed)).toBe(true);

    vi.doUnmock("drizzle-orm/pglite/migrator");
    expect(await ok(get("/api/health", null))).toMatchObject({ ok: true });
    await ok(usage());
  });

  it("開けない理由が接続ではない（設定・マイグレーションの誤り）なら 500 internal。ログに元のエラーの種類と場所が出る", async () => {
    await fresh(NOW);
    await closeDatabaseClientForTests();
    process.env.SLOPE_TEST_PGLITE_TEMPLATE = "Z:/slope-test/no-such-template.tar.gz"; // 開くのに失敗させる（ファイルがない）
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await usage();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ code: "internal", ...errorText.internal });
    const line = logged.mock.calls.map((args) => args.join(" ")).find((l) => l.startsWith("[internal]"));
    expect(line).toMatch(/^\[internal\] DatabaseOpenError <- \w+/); // 包んだエラーと、元のエラーの種類
    expect(line).toContain("src/server/db/index.ts"); // 開こうとした場所
    expect(line).toContain("cause at "); // 元のエラーの場所（ここでは写しのファイルを読もうとした Node の中）
    expect(line).not.toContain("no-such-template"); // message（パス）は出さない
    // health は DB を開けなければ、理由によらず 503（監視が「使えない」と分かればよい）
    expect((await get("/api/health", null)).status).toBe(503);

    process.env.SLOPE_TEST_PGLITE_TEMPLATE = template;
    expect(await ok(get("/api/health", null))).toMatchObject({ ok: true });
    await ok(usage());
  });

  it("マイグレーションの SQL の誤りは 500 internal。作りかけの PGlite は閉じてから捨てる", async () => {
    await fresh(NOW);
    await closeDatabaseClientForTests();
    const made: { closed: boolean }[] = [];
    vi.doMock("drizzle-orm/pglite/migrator", () => ({
      migrate: async (local: { $client: { closed: boolean } }) => {
        made.push(local.$client);
        throw Object.assign(new Error('syntax error at or near "CREAT"'), { code: "42601" });
      },
    }));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect((await usage()).status).toBe(500);
    expect((await usage()).status).toBe(500);
    expect(made).toHaveLength(2); // 呼ぶたびに開き直す
    expect(made.every((client) => client.closed)).toBe(true);
    expect(logged.mock.calls.flat().join(" ")).toContain("DatabaseOpenError <- Error(42601)");

    vi.doUnmock("drizzle-orm/pglite/migrator");
    await ok(usage());
  });
});
