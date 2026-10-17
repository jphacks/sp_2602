// DB の接続とテーブル定義の確認。DATABASE_URL なしなので PGlite（メモリ上の Postgres）で走る。
// 今の API はメモリ上の store（src/server/mock/store.ts）を使っていて、DB はまだつないでいない。接続の仕組みだけをここで確かめる。
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { rules } from "@/server/db/schema";

describe("db", () => {
  it("schema.ts のテーブルが作られ、書いて読める", async () => {
    const d = await db();
    const limits = [{ packageName: "com.example.app", label: "例", dailyMinutes: 30 }];
    const [row] = await d.insert(rules).values({ childId: "c1", limits }).returning();
    expect(row?.childId).toBe("c1");
    expect(row?.updatedAt).toBeInstanceOf(Date);
    const all = await d.select().from(rules);
    expect(all).toHaveLength(1);
    expect(all[0]?.limits).toEqual(limits);
  });

  it("2回目の db() は同じ接続を返す", async () => {
    expect(await db()).toBe(await db());
  });
});
