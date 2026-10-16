// DB の接続の確認（back-a の担当）。DATABASE_URL なしなので PGlite（メモリ上の Postgres）で走る。
// npm run kit:reset 後の状態: 接続だけを検査する。テーブルを足したら、書いて読めることをここに足す。
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";

describe("db", () => {
  it("接続できて、問い合わせが返る", async () => {
    const d = await db();
    const r = await d.execute(sql`select 1 as one`);
    expect(r.rows[0]).toEqual({ one: 1 });
  });

  it("2回目の db() は同じ接続を返す", async () => {
    expect(await db()).toBe(await db());
  });
});
