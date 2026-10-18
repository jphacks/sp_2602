// DB につながらないときの API の返事と、そのあとの戻り方（セキュリティ検査 AVL-04）。
// 前は手元の DB（PGlite）を閉じると、/api/health もログインが要る API も 500 internal を返し、閉じた DB を使い続けていた。
// 今は: 一時的に使えない 503 unavailable を返し（SQL・スタックは返さない）、DB が開ければ次の呼び出しで元に戻る
import { errorText } from "@contracts/errors";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabaseClientForTests } from "@/server/db";
import { DatabaseUnavailableError, isDatabaseUnavailable, toApiError } from "@/server/errors";
import { CHILD_ID, fresh, get, ok, PARENT, post } from "../verify/helpers";

const NOW = "2026-10-15T03:00:00.000Z";
const template = process.env.SLOPE_TEST_PGLITE_TEMPLATE;

afterEach(() => {
  process.env.SLOPE_TEST_PGLITE_TEMPLATE = template;
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

  it("開き直せない間は health もログインが要る API も 503 unavailable（中身は返さない）。開ければ 200 に戻る", async () => {
    await fresh(NOW);
    await closeDatabaseClientForTests();
    process.env.SLOPE_TEST_PGLITE_TEMPLATE = "Z:/slope-test/no-such-template.tar.gz"; // 開くのに失敗させる

    for (const res of [await get("/api/health", null), await usage()]) {
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body).toEqual({ code: "unavailable", ...errorText.unavailable });
    }

    process.env.SLOPE_TEST_PGLITE_TEMPLATE = template;
    expect(await ok(get("/api/health", null))).toMatchObject({ ok: true });
    await ok(usage());
  });
});
