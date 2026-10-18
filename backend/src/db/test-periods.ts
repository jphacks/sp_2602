import { and, eq } from "drizzle-orm";
import { recalculateC10InTransaction } from "./c10-recalculate.js";
import type { Database } from "./index.js";
import { childConfigVersions, familyLinks } from "./schema/family.js";
import { testPeriods } from "./schema/planning.js";
import { users } from "./schema/users.js";

export interface TestPeriodInput {
  /** Trusted caller identity from the authenticated request context. */
  actorId: string;
  childId: string;
  name: string;
  startDate: string;
  endDate: string;
  /** Version observed by the caller when saving; checked while the config row is locked. */
  expectedVersion?: number;
}

export interface TestPeriodUpdateInput extends TestPeriodInput {
  testPeriodId: string;
}

export interface TestPeriodMutationResult {
  configVersion: number;
  changed: boolean;
  testPeriod?: TestPeriod;
}

export interface TestPeriod {
  id: string;
  childId: string;
  createdByUserId: string;
  name: string;
  startDate: string;
  endDate: string;
  createdAt: Date;
  updatedAt: Date;
}

export class InvalidTestPeriodError extends Error {
  readonly code = "invalid_test_period";

  constructor() {
    super("A test period requires a nonblank name and valid calendar dates with endDate on or after startDate.");
    this.name = "InvalidTestPeriodError";
  }
}

export class TestPeriodAccessDeniedError extends Error {
  readonly code = "test_period_access_denied";

  constructor() {
    super("The caller must be the child or a parent linked to that child.");
    this.name = "TestPeriodAccessDeniedError";
  }
}

export class TestPeriodNotFoundError extends Error {
  readonly code = "test_period_not_found";

  constructor() {
    super("The test period does not exist for this child.");
    this.name = "TestPeriodNotFoundError";
  }
}

export class TestPeriodVersionConflictError extends Error {
  readonly code = "config_version_conflict";

  constructor() {
    super("The child configuration changed after it was read.");
    this.name = "TestPeriodVersionConflictError";
  }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validate(input: Pick<TestPeriodInput, "name" | "startDate" | "endDate">): void {
  if (typeof input.name !== "string" || input.name.trim().length === 0 || input.name.length > 120
    || !isCalendarDate(input.startDate) || !isCalendarDate(input.endDate)
    || input.endDate < input.startDate) {
    throw new InvalidTestPeriodError();
  }
}

async function assertCanManage(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], actorId: string, childId: string) {
  if (actorId === childId) {
    const [child] = await tx.select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, childId), eq(users.role, "child")))
      .limit(1)
      .for("key share");
    if (child) return;
  } else {
    const [link] = await tx.select({ id: familyLinks.id })
      .from(familyLinks)
      .where(and(eq(familyLinks.parentId, actorId), eq(familyLinks.childId, childId)))
      .limit(1)
      .for("key share");
    if (link) return;
  }
  throw new TestPeriodAccessDeniedError();
}

async function lockConfigVersion(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], childId: string): Promise<{ version: number; c10InputVersion: number }> {
  await tx.insert(childConfigVersions)
    .values({ childId, version: 0 })
    .onConflictDoNothing({ target: childConfigVersions.childId });
  const [config] = await tx.select({ version: childConfigVersions.version, c10InputVersion: childConfigVersions.c10InputVersion })
    .from(childConfigVersions)
    .where(eq(childConfigVersions.childId, childId))
    .limit(1)
    .for("update");
  if (!config) throw new Error("Config version row was not available after initialization.");
  return config;
}

async function bumpConfigVersion(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], childId: string, version: number, c10InputVersion: number): Promise<number> {
  const nextVersion = version + 1;
  await tx.update(childConfigVersions)
    .set({ version: nextVersion, c10InputVersion: c10InputVersion + 1, testPeriodsChangedVersion: nextVersion, updatedAt: new Date() })
    .where(eq(childConfigVersions.childId, childId));
  return nextVersion;
}

function assertExpectedVersion(actual: number, expected?: number): void {
  if (expected !== undefined && actual !== expected) throw new TestPeriodVersionConflictError();
}

/** Create a D3 period for the caller's own child account or a linked child. */
export async function createTestPeriod(db: Database, input: TestPeriodInput): Promise<TestPeriodMutationResult> {
  validate(input);
  return db.transaction(async (tx) => {
    await assertCanManage(tx, input.actorId, input.childId);
    const config = await lockConfigVersion(tx, input.childId);
    assertExpectedVersion(config.version, input.expectedVersion);
    const [period] = await tx.insert(testPeriods).values({
      childId: input.childId,
      createdByUserId: input.actorId,
      name: input.name.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
    }).returning();
    if (!period) throw new Error("The inserted test period was not returned.");
    const configVersion = await bumpConfigVersion(tx, input.childId, config.version, config.c10InputVersion);
    await recalculateC10InTransaction(tx, input.childId, config.c10InputVersion + 1);
    return { configVersion, changed: true, testPeriod: period };
  });
}

/** List D3 periods for the caller's own child account or a linked child. */
export async function listTestPeriods(db: Database, actorId: string, childId: string): Promise<TestPeriod[]> {
  return db.transaction(async (tx) => {
    await assertCanManage(tx, actorId, childId);
    return tx.select().from(testPeriods).where(eq(testPeriods.childId, childId))
      .orderBy(testPeriods.startDate, testPeriods.id);
  }, { isolationLevel: "repeatable read" });
}

/** Update a D3 period; identical values are a no-op and retain the config version. */
export async function updateTestPeriod(db: Database, input: TestPeriodUpdateInput): Promise<TestPeriodMutationResult> {
  validate(input);
  return db.transaction(async (tx) => {
    await assertCanManage(tx, input.actorId, input.childId);
    const config = await lockConfigVersion(tx, input.childId);
    assertExpectedVersion(config.version, input.expectedVersion);
    const [current] = await tx.select().from(testPeriods)
      .where(and(eq(testPeriods.id, input.testPeriodId), eq(testPeriods.childId, input.childId)))
      .limit(1).for("update");
    if (!current) throw new TestPeriodNotFoundError();
    const name = input.name.trim();
    const changed = current.name !== name || current.startDate !== input.startDate || current.endDate !== input.endDate;
    if (!changed) return { configVersion: config.version, changed: false, testPeriod: current };
    const [period] = await tx.update(testPeriods).set({
      name,
      startDate: input.startDate,
      endDate: input.endDate,
      updatedAt: new Date(),
    }).where(eq(testPeriods.id, input.testPeriodId)).returning();
    if (!period) throw new Error("The locked test period could not be updated.");
    const configVersion = await bumpConfigVersion(tx, input.childId, config.version, config.c10InputVersion);
    await recalculateC10InTransaction(tx, input.childId, config.c10InputVersion + 1);
    return { configVersion, changed: true, testPeriod: period };
  });
}

/** Delete a D3 period; a missing period is reported without changing the config version. */
export async function deleteTestPeriod(
  db: Database,
  input: Pick<TestPeriodInput, "actorId" | "childId" | "expectedVersion"> & { testPeriodId: string },
): Promise<TestPeriodMutationResult> {
  return db.transaction(async (tx) => {
    await assertCanManage(tx, input.actorId, input.childId);
    const config = await lockConfigVersion(tx, input.childId);
    assertExpectedVersion(config.version, input.expectedVersion);
    const [period] = await tx.delete(testPeriods)
      .where(and(eq(testPeriods.id, input.testPeriodId), eq(testPeriods.childId, input.childId)))
      .returning({ id: testPeriods.id });
    if (!period) return { configVersion: config.version, changed: false };
    const configVersion = await bumpConfigVersion(tx, input.childId, config.version, config.c10InputVersion);
    await recalculateC10InTransaction(tx, input.childId, config.c10InputVersion + 1);
    return { configVersion, changed: true };
  });
}
