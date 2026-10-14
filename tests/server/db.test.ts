// DB の接続とテーブル定義の確認（back の所有）。DATABASE_URL なしなので PGlite（メモリ上の Postgres）で走る。
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { aiCalls } from "@/server/db/schema";

describe("db", () => {
  it("schema.ts のテーブルが作られ、書いて読める", async () => {
    const d = await db();
    const [row] = await d
      .insert(aiCalls)
      .values({ route: "analyze", input: { items: 2 }, output: { ok: true }, ms: 12 })
      .returning();
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row?.createdAt).toBeInstanceOf(Date);
    const all = await d.select().from(aiCalls);
    expect(all).toHaveLength(1);
    expect(all[0]?.output).toEqual({ ok: true });
  });

  it("2回目の db() は同じ接続を返す", async () => {
    expect(await db()).toBe(await db());
  });
});
