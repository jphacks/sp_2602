import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "../index.js";
import { users } from "../schema/users.js";
import { familyLinks } from "../schema/family.js";
import { planCalculationVersions, dailyLimits, testPeriods } from "../schema/planning.js";
import { usageSyncBatches, usageRecords } from "../schema/usage.js";
import { childConfigVersions } from "../schema/family.js";
import { readChildConfigSnapshot } from "../config-snapshot.js";
import {
  savePlanCalculation,
  StalePlanCalculationConfigError,
} from "../plan-calculations.js";
import {
  createTestPeriod,
  deleteTestPeriod,
  listTestPeriods,
  TestPeriodAccessDeniedError,
  updateTestPeriod,
} from "../test-periods.js";

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

  it("saves each C10 revision with its complete D6 snapshot and rejects stale config", async () => {
    const childId = crypto.randomUUID();
    await db!.insert(users).values({ id: childId, role: "child" });
    await db!.insert(childConfigVersions).values({ childId, version: 4 });
    try {
      const first = await savePlanCalculation(db!, {
        childId,
        sourceConfigVersion: 4,
        dailyLimits: [
          { limitDate: "2099-02-01", limitMinutes: 120 },
          { limitDate: "2099-02-02", limitMinutes: 0 },
        ],
      });
      expect(first).toEqual({ version: 1, sourceConfigVersion: 4, savedDailyLimitCount: 2 });

      const second = await savePlanCalculation(db!, {
        childId,
        sourceConfigVersion: 4,
        dailyLimits: [
          { limitDate: "2099-02-01", limitMinutes: 90 },
          { limitDate: "2099-02-02", limitMinutes: 0 },
        ],
      });
      expect(second.version).toBe(2);

      const snapshot = await readChildConfigSnapshot(db!, childId);
      expect(snapshot.calculation).toEqual({
        version: 2,
        sourceConfigVersion: 4,
        matchesConfigVersion: true,
      });
      expect(snapshot.dailyLimits).toEqual([
        { limitDate: "2099-02-01", limitMinutes: 90, calculationVersion: 2 },
        { limitDate: "2099-02-02", limitMinutes: 0, calculationVersion: 2 },
      ]);

      await expect(savePlanCalculation(db!, {
        childId,
        sourceConfigVersion: 3,
        dailyLimits: [{ limitDate: "2099-02-01", limitMinutes: 60 }],
      })).rejects.toBeInstanceOf(StalePlanCalculationConfigError);
      const versions = await db!.select().from(planCalculationVersions)
        .where(eq(planCalculationVersions.childId, childId));
      expect(versions).toHaveLength(2);
    } finally {
      await db!.delete(dailyLimits).where(eq(dailyLimits.childId, childId));
      await db!.delete(planCalculationVersions).where(eq(planCalculationVersions.childId, childId));
      await db!.delete(childConfigVersions).where(eq(childConfigVersions.childId, childId));
      await db!.delete(users).where(eq(users.id, childId));
    }
  });

  it("supports linked-parent and own-child D3 CRUD with atomic config revisions", async () => {
    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    const strangerId = crypto.randomUUID();
    await db!.insert(users).values([
      { id: parentId, role: "parent" },
      { id: childId, role: "child" },
      { id: strangerId, role: "parent" },
    ]);
    await db!.insert(familyLinks).values({ parentId, childId });
    try {
      const created = await createTestPeriod(db!, {
        actorId: childId,
        childId,
        name: "  Mock Exam  ",
        startDate: "2099-01-10",
        endDate: "2099-01-12",
      });
      expect(created.changed).toBe(true);
      expect(created.configVersion).toBe(2);
      expect(created.testPeriod?.name).toBe("Mock Exam");

      const listed = await listTestPeriods(db!, parentId, childId);
      expect(listed).toHaveLength(1);
      expect(listed[0]?.startDate).toBe("2099-01-10");
      const noOpUpdate = await updateTestPeriod(db!, {
        actorId: parentId,
        childId,
        testPeriodId: created.testPeriod!.id,
        name: "Mock Exam",
        startDate: "2099-01-10",
        endDate: "2099-01-12",
      });
      expect(noOpUpdate).toMatchObject({ changed: false, configVersion: 2 });

      await expect(listTestPeriods(db!, strangerId, childId)).rejects.toBeInstanceOf(TestPeriodAccessDeniedError);
      const updated = await updateTestPeriod(db!, {
        actorId: parentId,
        childId,
        testPeriodId: created.testPeriod!.id,
        name: "Final Exam",
        startDate: "2099-01-11",
        endDate: "2099-01-13",
      });
      expect(updated).toMatchObject({ changed: true, configVersion: 3 });

      const deleted = await deleteTestPeriod(db!, {
        actorId: childId,
        childId,
        testPeriodId: created.testPeriod!.id,
      });
      expect(deleted).toMatchObject({ changed: true, configVersion: 4 });
      const repeatedDelete = await deleteTestPeriod(db!, {
        actorId: childId,
        childId,
        testPeriodId: created.testPeriod!.id,
      });
      expect(repeatedDelete).toMatchObject({ changed: false, configVersion: 4 });
    } finally {
      await db!.delete(testPeriods).where(eq(testPeriods.childId, childId));
      await db!.delete(childConfigVersions).where(eq(childConfigVersions.childId, childId));
      await db!.delete(familyLinks).where(eq(familyLinks.parentId, parentId));
      await db!.delete(users).where(inArray(users.id, [parentId, childId, strangerId]));
    }
  });
});
