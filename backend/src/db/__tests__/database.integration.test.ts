import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayString } from "../../../../contracts/dates.js";
import { eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "../index.js";
import { users } from "../schema/users.js";
import { familyLinks } from "../schema/family.js";
import { planCalculationVersions, dailyLimits, planSettings, testPeriods } from "../schema/planning.js";
import { usageSyncBatches, usageDayReports, usageRecords } from "../schema/usage.js";
import { childConfigVersions } from "../schema/family.js";
import { readChildConfigSnapshot } from "../config-snapshot.js";
import { readParentUsage } from "../usage-read.js";
import { readExcludedAppsSnapshot, replaceExcludedAppsForParent, ExcludedAppsVersionConflictError } from "../excluded-app-settings.js";
import { excludedApps } from "../schema/excluded-apps.js";
import { childAppliedVersions, childUsualLimits, excludedAppStates, removedExcludedApps } from "../schema/settings-state.js";
import { blankPeriods } from "../schema/settings-state.js";
import { createBlankPeriod, listBlankPeriods } from "../blank-periods.js";
import { recalculateC10InTransaction } from "../c10-recalculate.js";
import { savePlanSettingsForParent, saveUsualLimitForParent, PlanSettingsVersionConflictError } from "../plan-settings.js";
import {
  savePlanCalculation,
  StalePlanCalculationConfigError,
} from "../plan-calculations.js";
import {
  createTestPeriod,
  deleteTestPeriod,
  listTestPeriods,
  TestPeriodAccessDeniedError,
  TestPeriodVersionConflictError,
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

  it("persists D8 plan without inventing an omitted usual limit and checks versions atomically", async () => {
    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    await db!.insert(users).values([
      { id: parentId, role: "parent" },
      { id: childId, role: "child" },
    ]);
    await db!.insert(familyLinks).values({ parentId, childId });
    try {
      const savedPlan = await savePlanSettingsForParent(db!, {
        parentId,
        childId,
        expectedVersion: 0,
        planStartDate: "2099-03-01",
        startLimitMinutes: 120,
        finalGoalMinutes: 60,
      });
      expect(savedPlan).toEqual({ configVersion: 1, changed: true });
      expect(await db!.select().from(childUsualLimits).where(eq(childUsualLimits.childId, childId))).toHaveLength(0);

      const savedUsualLimit = await saveUsualLimitForParent(db!, {
        parentId, childId, expectedVersion: 1, usualLimitMinutes: 90,
      });
      expect(savedUsualLimit).toEqual({ configVersion: 2, changed: true });
      await expect(saveUsualLimitForParent(db!, {
        parentId, childId, expectedVersion: 1, usualLimitMinutes: 80,
      })).rejects.toBeInstanceOf(PlanSettingsVersionConflictError);
    } finally {
      await db!.delete(dailyLimits).where(eq(dailyLimits.childId, childId));
      await db!.delete(planCalculationVersions).where(eq(planCalculationVersions.childId, childId));
      await db!.delete(childUsualLimits).where(eq(childUsualLimits.childId, childId));
      await db!.delete(planSettings).where(eq(planSettings.childId, childId));
      await db!.delete(childConfigVersions).where(eq(childConfigVersions.childId, childId));
      await db!.delete(familyLinks).where(eq(familyLinks.childId, childId));
      await db!.delete(users).where(inArray(users.id, [parentId, childId]));
    }
  });

  it("commits D8/D3, D6, and the C10 source version together; D=0 uses G then restores usual limit", async () => {
    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    const today = todayString();
    const tomorrow = addDays(today, 1);
    const afterTest = addDays(today, 2);
    await db!.insert(users).values([
      { id: parentId, role: "parent" },
      { id: childId, role: "child" },
    ]);
    await db!.insert(familyLinks).values({ parentId, childId });
    try {
      await saveUsualLimitForParent(db!, { parentId, childId, expectedVersion: 0, usualLimitMinutes: 180 });
      await savePlanSettingsForParent(db!, {
        parentId,
        childId,
        expectedVersion: 1,
        planStartDate: today,
        startLimitMinutes: 300,
        finalGoalMinutes: 60,
      });
      await createTestPeriod(db!, {
        actorId: parentId,
        childId,
        expectedVersion: 2,
        name: "Final exam",
        startDate: today,
        endDate: tomorrow,
      });

      const snapshot = await readChildConfigSnapshot(db!, childId);
      expect(snapshot.calculation?.matchesC10InputVersion).toBe(true);
      expect(snapshot.dailyLimits.find((limit) => limit.limitDate === today)?.limitMinutes).toBe(180);
      expect(snapshot.dailyLimits.find((limit) => limit.limitDate === tomorrow)?.limitMinutes).toBe(60);
      expect(snapshot.dailyLimits.find((limit) => limit.limitDate === afterTest)?.limitMinutes).toBe(180);

      const calculationRowsBefore = await db!.select().from(planCalculationVersions)
        .where(eq(planCalculationVersions.childId, childId));
      await expect(createTestPeriod(db!, {
        actorId: parentId,
        childId,
        expectedVersion: 3,
        name: "Overlapping exam",
        startDate: tomorrow,
        endDate: tomorrow,
      })).rejects.toMatchObject({ code: "invalid_c10_inputs" });
      const afterRejectedWrite = await readChildConfigSnapshot(db!, childId);
      expect(afterRejectedWrite.configVersion).toBe(snapshot.configVersion);
      expect(afterRejectedWrite.testPeriods).toHaveLength(1);
      expect(await db!.select().from(planCalculationVersions)
        .where(eq(planCalculationVersions.childId, childId))).toHaveLength(calculationRowsBefore.length);
    } finally {
      await db!.delete(testPeriods).where(eq(testPeriods.childId, childId));
      await db!.delete(dailyLimits).where(eq(dailyLimits.childId, childId));
      await db!.delete(planCalculationVersions).where(eq(planCalculationVersions.childId, childId));
      await db!.delete(planSettings).where(eq(planSettings.childId, childId));
      await db!.delete(childUsualLimits).where(eq(childUsualLimits.childId, childId));
      await db!.delete(childConfigVersions).where(eq(childConfigVersions.childId, childId));
      await db!.delete(familyLinks).where(eq(familyLinks.parentId, parentId));
      await db!.delete(users).where(inArray(users.id, [parentId, childId]));
    }
  });

  it("rejects family links that reverse the user roles", async () => {
    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    await db!.insert(users).values([
      { id: parentId, role: "parent" },
      { id: childId, role: "child" },
    ]);
    await expect(db!.insert(familyLinks).values({ parentId: childId, childId: parentId }))
      .rejects.toMatchObject({ cause: { code: "23503" } });
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
      await tx.insert(usageDayReports).values({
        submissionId,
        childId,
        usageDate: record.usageDate,
        measuredAt: new Date("2026-10-17T12:00:00.000Z"),
        restrictedMinutes: record.usedMinutes,
      });
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
          sourceC10InputVersion: 1,
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
    await db!.insert(childConfigVersions).values({ childId, version: 4, c10InputVersion: 4 });
    try {
      const first = await savePlanCalculation(db!, {
        childId,
        sourceC10InputVersion: 4,
        dailyLimits: [
          { limitDate: "2099-02-01", limitMinutes: 120 },
          { limitDate: "2099-02-02", limitMinutes: 0 },
        ],
      });
      expect(first).toEqual({ version: 1, sourceC10InputVersion: 4, savedDailyLimitCount: 2 });

      const second = await savePlanCalculation(db!, {
        childId,
        sourceC10InputVersion: 4,
        dailyLimits: [
          { limitDate: "2099-02-01", limitMinutes: 90 },
          { limitDate: "2099-02-02", limitMinutes: 0 },
        ],
      });
      expect(second.version).toBe(2);

      const history = await db!.select({
        limitDate: dailyLimits.limitDate,
        limitMinutes: dailyLimits.limitMinutes,
        calculationVersion: dailyLimits.calculationVersion,
      }).from(dailyLimits).where(eq(dailyLimits.childId, childId))
        .orderBy(dailyLimits.calculationVersion, dailyLimits.limitDate);
      expect(history).toEqual([
        { limitDate: "2099-02-01", limitMinutes: 120, calculationVersion: 1 },
        { limitDate: "2099-02-02", limitMinutes: 0, calculationVersion: 1 },
        { limitDate: "2099-02-01", limitMinutes: 90, calculationVersion: 2 },
        { limitDate: "2099-02-02", limitMinutes: 0, calculationVersion: 2 },
      ]);

      const snapshot = await readChildConfigSnapshot(db!, childId);
      expect(snapshot.calculation).toEqual({
        version: 2,
        sourceC10InputVersion: 4,
        matchesC10InputVersion: true,
      });
      expect(snapshot.dailyLimits).toEqual([
        { limitDate: "2099-02-01", limitKind: "limited", limitMinutes: 90, blankPeriodId: null, calculationVersion: 2 },
        { limitDate: "2099-02-02", limitKind: "limited", limitMinutes: 0, blankPeriodId: null, calculationVersion: 2 },
      ]);

      await expect(savePlanCalculation(db!, {
        childId,
        sourceC10InputVersion: 3,
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

  it("reads C6 limits only from the latest calculation matching current C10 inputs", async () => {
    const childId = crypto.randomUUID();
    await db!.insert(users).values({ id: childId, role: "child" });
    try {
      await db!.insert(childConfigVersions).values({ childId, version: 3, c10InputVersion: 2 });
      await db!.insert(planCalculationVersions).values([
        { childId, version: 1, sourceC10InputVersion: 1 },
        { childId, version: 2, sourceC10InputVersion: 2 },
        { childId, version: 3, sourceC10InputVersion: 2 },
      ]);
      await db!.insert(dailyLimits).values([
        { childId, calculationVersion: 1, limitDate: "2099-02-01", limitMinutes: 120 },
        { childId, calculationVersion: 2, limitDate: "2099-02-01", limitMinutes: 90 },
        { childId, calculationVersion: 3, limitDate: "2099-02-01", limitMinutes: 80 },
      ]);

      const current = await readParentUsage(db!, { childId, from: "2099-02-01", to: "2099-02-01" });
      expect(current.days[0]?.limit).toEqual({ kind: "limited", limitMinutes: 80 });

      await db!.update(childConfigVersions).set({ c10InputVersion: 3 }).where(eq(childConfigVersions.childId, childId));
      const stale = await readParentUsage(db!, { childId, from: "2099-02-01", to: "2099-02-01" });
      expect(stale.days[0]?.limit).toBeNull();
    } finally {
      await db!.delete(dailyLimits).where(eq(dailyLimits.childId, childId));
      await db!.delete(planCalculationVersions).where(eq(planCalculationVersions.childId, childId));
      await db!.delete(childConfigVersions).where(eq(childConfigVersions.childId, childId));
      await db!.delete(users).where(eq(users.id, childId));
    }
  });

  it("persists blank-period unlimited D6 limits to C7 and C6 while preserving finalized history", async () => {
    const childId = crypto.randomUUID();
    const today = todayString();
    const finalizedDate = addDays(today, -1);
    const blankDate = addDays(today, 1);
    const blankPeriodId = crypto.randomUUID();
    const calculationTime = new Date(`${today}T12:00:00.000Z`);
    await db!.insert(users).values({ id: childId, role: "child" });
    try {
      await db!.insert(childConfigVersions).values({ childId, version: 1, c10InputVersion: 1 });
      await db!.insert(blankPeriods).values({
        id: blankPeriodId,
        childId,
        name: "School break",
        startDate: blankDate,
        endDate: blankDate,
      });
      await db!.insert(planCalculationVersions).values({
        childId,
        version: 1,
        sourceC10InputVersion: 1,
      });
      await db!.insert(dailyLimits).values({
        childId,
        limitDate: finalizedDate,
        limitKind: "limited",
        limitMinutes: 1442,
        isFinalized: true,
        calculationVersion: 1,
      });

      await db!.transaction((tx) => recalculateC10InTransaction(tx, childId, 1, calculationTime));
      const firstSnapshot = await readChildConfigSnapshot(db!, childId);
      expect(firstSnapshot.dailyLimits).toContainEqual({
        limitDate: blankDate,
        limitKind: "unlimited",
        limitMinutes: null,
        blankPeriodId,
        calculationVersion: 2,
      });
      expect(firstSnapshot.dailyLimits).toContainEqual({
        limitDate: finalizedDate,
        limitKind: "limited",
        limitMinutes: 1442,
        blankPeriodId: null,
        calculationVersion: 2,
      });
      expect((await readParentUsage(db!, { childId, from: blankDate, to: blankDate })).days[0]?.limit)
        .toEqual({ kind: "unlimited", blankPeriodId });

      await db!.update(childConfigVersions).set({ c10InputVersion: 2 })
        .where(eq(childConfigVersions.childId, childId));
      await db!.transaction((tx) => recalculateC10InTransaction(tx, childId, 2, calculationTime));

      const history = await db!.select({
        limitDate: dailyLimits.limitDate,
        limitKind: dailyLimits.limitKind,
        limitMinutes: dailyLimits.limitMinutes,
        isFinalized: dailyLimits.isFinalized,
        calculationVersion: dailyLimits.calculationVersion,
      }).from(dailyLimits).where(eq(dailyLimits.childId, childId))
        .orderBy(dailyLimits.calculationVersion, dailyLimits.limitDate);
      expect(history.filter((row) => row.limitDate === finalizedDate)).toEqual([
        { limitDate: finalizedDate, limitKind: "limited", limitMinutes: 1442, isFinalized: true, calculationVersion: 1 },
        { limitDate: finalizedDate, limitKind: "limited", limitMinutes: 1442, isFinalized: true, calculationVersion: 2 },
        { limitDate: finalizedDate, limitKind: "limited", limitMinutes: 1442, isFinalized: true, calculationVersion: 3 },
      ]);
      const latestSnapshot = await readChildConfigSnapshot(db!, childId);
      expect(latestSnapshot.dailyLimits).toContainEqual({
        limitDate: blankDate,
        limitKind: "unlimited",
        limitMinutes: null,
        blankPeriodId,
        calculationVersion: 3,
      });
      expect((await readParentUsage(db!, { childId, from: finalizedDate, to: finalizedDate })).days[0]?.limit)
        .toEqual({ kind: "limited", limitMinutes: 1442 });
    } finally {
      await db!.delete(dailyLimits).where(eq(dailyLimits.childId, childId));
      await db!.delete(planCalculationVersions).where(eq(planCalculationVersions.childId, childId));
      await db!.delete(blankPeriods).where(eq(blankPeriods.childId, childId));
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
      expect(created.configVersion).toBe(1);
      expect(created.testPeriod?.name).toBe("Mock Exam");

      await expect(createTestPeriod(db!, {
        actorId: childId,
        childId,
        expectedVersion: 0,
        name: "Stale write",
        startDate: "2099-02-01",
        endDate: "2099-02-02",
      })).rejects.toBeInstanceOf(TestPeriodVersionConflictError);

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
      expect(noOpUpdate).toMatchObject({ changed: false, configVersion: 1 });

      await expect(listTestPeriods(db!, strangerId, childId)).rejects.toBeInstanceOf(TestPeriodAccessDeniedError);
      const updated = await updateTestPeriod(db!, {
        actorId: parentId,
        childId,
        testPeriodId: created.testPeriod!.id,
        name: "Final Exam",
        startDate: "2099-01-11",
        endDate: "2099-01-13",
      });
      expect(updated).toMatchObject({ changed: true, configVersion: 2 });

      const deleted = await deleteTestPeriod(db!, {
        actorId: childId,
        childId,
        testPeriodId: created.testPeriod!.id,
      });
      expect(deleted).toMatchObject({ changed: true, configVersion: 3 });
      const repeatedDelete = await deleteTestPeriod(db!, {
        actorId: childId,
        childId,
        testPeriodId: created.testPeriod!.id,
      });
      expect(repeatedDelete).toMatchObject({ changed: false, configVersion: 3 });
    } finally {
      await db!.delete(testPeriods).where(eq(testPeriods.childId, childId));
      await db!.delete(dailyLimits).where(eq(dailyLimits.childId, childId));
      await db!.delete(planCalculationVersions).where(eq(planCalculationVersions.childId, childId));
      await db!.delete(childConfigVersions).where(eq(childConfigVersions.childId, childId));
      await db!.delete(familyLinks).where(eq(familyLinks.parentId, parentId));
      await db!.delete(users).where(inArray(users.id, [parentId, childId, strangerId]));
    }
  });

  it("stores C9 labels, versions, removals, and checks the expected config version", async () => {
    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    await db!.insert(users).values([
      { id: parentId, role: "parent" },
      { id: childId, role: "child" },
    ]);
    await db!.insert(familyLinks).values({ parentId, childId });
    try {
      const first = await replaceExcludedAppsForParent(db!, {
        parentId,
        childId,
        expectedVersion: 0,
        appIds: [{ appId: "com.example.one", label: "One" }],
      });
      expect(first).toMatchObject({ configVersion: 1, changed: true });
      expect(first.enabledApps).toEqual([{ appId: "com.example.one", label: "One", sinceVersion: 1 }]);
      await savePlanCalculation(db!, {
        childId,
        sourceC10InputVersion: 1,
        dailyLimits: [{ limitDate: "2099-02-01", limitMinutes: 120 }],
      });
      const c9OnlySnapshot = await readChildConfigSnapshot(db!, childId);
      expect(c9OnlySnapshot).toMatchObject({ configVersion: 1, c10InputVersion: 1 });
      expect(c9OnlySnapshot.calculation?.matchesC10InputVersion).toBe(true);

      const removed = await replaceExcludedAppsForParent(db!, {
        parentId,
        childId,
        expectedVersion: 1,
        appIds: [],
      });
      expect(removed.configVersion).toBe(2);
      expect(await readExcludedAppsSnapshot(db!, childId)).toMatchObject({
        appsChangedVersion: 2,
        apps: [],
        removedApps: [{ appId: "com.example.one", label: "One", removedVersion: 2 }],
      });

      const afterC9Snapshot = await readChildConfigSnapshot(db!, childId);
      expect(afterC9Snapshot).toMatchObject({ configVersion: 2, c10InputVersion: 1 });
      expect(afterC9Snapshot.calculation?.matchesC10InputVersion).toBe(true);

      await createTestPeriod(db!, {
        actorId: parentId,
        childId,
        expectedVersion: 2,
        name: "C10 input changed",
        startDate: "2099-03-01",
        endDate: "2099-03-02",
      });
      const afterD3Snapshot = await readChildConfigSnapshot(db!, childId);
      expect(afterD3Snapshot).toMatchObject({ configVersion: 3, c10InputVersion: 2 });
      expect(afterD3Snapshot.calculation?.matchesC10InputVersion).toBe(true);

      await expect(replaceExcludedAppsForParent(db!, {
        parentId,
        childId,
        expectedVersion: 1,
        appIds: [],
      })).rejects.toBeInstanceOf(ExcludedAppsVersionConflictError);
    } finally {
      await db!.delete(testPeriods).where(eq(testPeriods.childId, childId));
      await db!.delete(dailyLimits).where(eq(dailyLimits.childId, childId));
      await db!.delete(planCalculationVersions).where(eq(planCalculationVersions.childId, childId));
      await db!.delete(removedExcludedApps).where(eq(removedExcludedApps.childId, childId));
      await db!.delete(excludedApps).where(eq(excludedApps.childId, childId));
      await db!.delete(excludedAppStates).where(eq(excludedAppStates.childId, childId));
      await db!.delete(childAppliedVersions).where(eq(childAppliedVersions.childId, childId));
      await db!.delete(childConfigVersions).where(eq(childConfigVersions.childId, childId));
      await db!.delete(familyLinks).where(eq(familyLinks.parentId, parentId));
      await db!.delete(users).where(inArray(users.id, [parentId, childId]));
    }
  });

  it("rejects overlapping D3 and blank periods atomically when C10 cannot calculate them", async () => {
    const parentId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    await db!.insert(users).values([
      { id: parentId, role: "parent" },
      { id: childId, role: "child" },
    ]);
    await db!.insert(familyLinks).values({ parentId, childId });
    try {
      await savePlanSettingsForParent(db!, {
        parentId,
        childId,
        expectedVersion: 0,
        planStartDate: "2099-05-01",
        startLimitMinutes: 200,
        finalGoalMinutes: 80,
      });
      await createTestPeriod(db!, {
        actorId: parentId,
        childId,
        expectedVersion: 1,
        name: "first exam",
        startDate: "2099-05-01",
        endDate: "2099-05-03",
      });
      await expect(createTestPeriod(db!, {
        actorId: parentId,
        childId,
        expectedVersion: 2,
        name: "overlapping exam",
        startDate: "2099-05-03",
        endDate: "2099-05-04",
      })).rejects.toMatchObject({ code: "invalid_c10_inputs" });
      expect(await listTestPeriods(db!, parentId, childId)).toHaveLength(1);

      await createBlankPeriod(db!, {
        parentId,
        childId,
        expectedVersion: 2,
        name: "first blank",
        startDate: "2099-06-01",
        endDate: "2099-06-03",
      });
      await expect(createBlankPeriod(db!, {
        parentId,
        childId,
        expectedVersion: 3,
        name: "overlapping blank",
        startDate: "2099-06-03",
        endDate: "2099-06-05",
      })).rejects.toMatchObject({ code: "invalid_c10_inputs" });
      expect((await listBlankPeriods(db!, parentId, childId)).blankPeriods).toHaveLength(1);
    } finally {
      await db!.delete(testPeriods).where(eq(testPeriods.childId, childId));
      await db!.delete(blankPeriods).where(eq(blankPeriods.childId, childId));
      await db!.delete(dailyLimits).where(eq(dailyLimits.childId, childId));
      await db!.delete(planCalculationVersions).where(eq(planCalculationVersions.childId, childId));
      await db!.delete(planSettings).where(eq(planSettings.childId, childId));
      await db!.delete(childUsualLimits).where(eq(childUsualLimits.childId, childId));
      await db!.delete(childConfigVersions).where(eq(childConfigVersions.childId, childId));
      await db!.delete(familyLinks).where(eq(familyLinks.parentId, parentId));
      await db!.delete(users).where(inArray(users.id, [parentId, childId]));
    }
  });
});
