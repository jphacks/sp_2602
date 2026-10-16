// DB の接続とテーブル定義の確認（back-a の担当）。DATABASE_URL なしなので PGlite（メモリ上の Postgres）で走る。
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { rules } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { getRules, saveRules } from "@/server/rules";

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

describe("制限ルールの保存（例）", () => {
  it("保存して取得できる。同じ子どもへの2回目の保存は上書きする", async () => {
    await saveRules("c2", [{ packageName: "a", label: "A", dailyMinutes: 10 }]);
    await saveRules("c2", [{ packageName: "b", label: "B", dailyMinutes: 20 }]);
    const r = await getRules("c2");
    expect(r.limits).toEqual([{ packageName: "b", label: "B", dailyMinutes: 20 }]);
  });

  it("登録のない子どもは not_found", async () => {
    await expect(getRules("nobody")).rejects.toBeInstanceOf(AppError);
  });
});

describe("使用状況の保存", () => {
  it("保存して最新の日を取得できる。同じ日の再送は上書きする", async () => {
    const { getLatestUsage, saveUsage } = await import("@/server/usage");
    await saveUsage("u1", "2026-10-16", [{ packageName: "a", label: "A", usedMinutes: 1 }]);
    await saveUsage("u1", "2026-10-17", [{ packageName: "a", label: "A", usedMinutes: 2 }]);
    await saveUsage("u1", "2026-10-17", [{ packageName: "a", label: "A", usedMinutes: 3 }]);
    const u = await getLatestUsage("u1");
    expect(u.date).toBe("2026-10-17");
    expect(u.apps[0]?.usedMinutes).toBe(3);
  });

  it("未登録の子どもは not_found", async () => {
    const { getLatestUsage } = await import("@/server/usage");
    await expect(getLatestUsage("nobody")).rejects.toThrow(AppError);
  });
});
