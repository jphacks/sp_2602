import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "../index.js";
import { users } from "../schema/users.js";
import { familyLinks } from "../schema/family.js";
import { planCalculationVersions, dailyLimits } from "../schema/planning.js";
import { usageSyncBatches, usageRecords } from "../schema/usage.js";

const testUrl = process.env.TEST_DATABASE_URL;
const suite = describe.skipIf(!testUrl);
const rollbackMarker = "__integration_test_rollback__";
let client: ReturnType<typeof createDatabase>["client"] | undefined;
let db: ReturnType<typeof createDatabase>["db"] | undefined;

suite("PostgreSQL schema and persistence", () => {
  beforeAll(async () => {
    const connection = createDatabase(testUrl!);
    client = connection.client;
    db = connection.db;
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  afterAll(async () => {
    await client?.end();
  });

  it("connects to PostgreSQL and can read the migrated schema", async () => {
    const result = await db!.execute(sql`select 1 as connected`);
    expect(Number(result[0]?.connected)).toBe(1);
    const tables = await db!.execute(sql`
      select table_name from information_schema.tables
      where table_schema = current_schema() and table_name = 'usage_records'
    `);
    expect(tables).toHaveLength(1);
  });

  it("allows many family links without imposing a 1:1 cardinality", async () => {
    const ids = Array.from({ length: 4 }, () => crypto.randomUUID());
    await expect(db!.transaction(async (tx) => {
      await tx.insert(users).values([
        { id: ids[0]!, role: "parent" },
        { id: ids[1]!, role: "parent" },
        { id: ids[2]!, role: "child" },
        { id: ids[3]!, role: "child" },
      ]);
      await tx.insert(familyLinks).values([
        { parentId: ids[0]!, childId: ids[2]! },
        { parentId: ids[1]!, childId: ids[2]! },
        { parentId: ids[0]!, childId: ids[3]! },
      ]);
      throw new Error(rollbackMarker);
    })).rejects.toThrow(rollbackMarker);
  });

  it("rejects family links that reverse the user roles", async () => {
    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    await db!.insert(users).values([
      { id: parentId, role: "parent" },
      { id: childId, role: "child" },
    ]);
    await expect(db!.insert(familyLinks).values({ parentId: childId, childId: parentId }))
      .rejects.toMatchObject({ code: "23503" });
    await db!.delete(users).where(inArray(users.id, [parentId, childId]));
  });

  it("keeps duplicate upload IDs idempotent and scopes records to that child", async () => {
    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();
    const record = {
      submissionId,
      childId,
      usageDate: "2026-10-17",
      appId: "jp.example.app",
      usedMinutes: 12,
    };
    await expect(db!.transaction(async (tx) => {
      await tx.insert(users).values([
        { id: parentId, role: "parent" },
        { id: childId, role: "child" },
      ]);
      await tx.insert(familyLinks).values({ parentId, childId });
      await tx.insert(usageSyncBatches).values({ submissionId, childId, payloadHash: "sha256:fixture" });
      const first = await tx.insert(usageRecords).values(record).onConflictDoNothing().returning();
      const retry = await tx.insert(usageRecords).values(record).onConflictDoNothing().returning();
      expect(first).toHaveLength(1);
      expect(retry).toHaveLength(0);
      throw new Error(rollbackMarker);
    })).rejects.toThrow(rollbackMarker);
  });

  it("rolls back calculation version and daily limits as one unit", async () => {
    const childId = crypto.randomUUID();
    const calculatedDate = "2099-01-01";
    await db!.insert(users).values({ id: childId, role: "child" });
    try {
      await db!.transaction(async (tx) => {
        await tx.insert(planCalculationVersions).values({
          childId,
          version: 1,
          sourceConfigVersion: 1,
        });
        await tx.insert(dailyLimits).values({
          childId,
          limitDate: calculatedDate,
          limitMinutes: 0,
          calculationVersion: 1,
        });
        throw new Error(rollbackMarker);
      });
    } catch (error) {
      expect(error).toHaveProperty("message", rollbackMarker);
    }
    const remaining = await db!.select().from(dailyLimits).where(eq(dailyLimits.childId, childId));
    expect(remaining).toHaveLength(0);
    await db!.delete(users).where(eq(users.id, childId));
  });
});
