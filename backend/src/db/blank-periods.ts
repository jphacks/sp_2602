import { and, eq } from "drizzle-orm";
import { recalculateC10InTransaction } from "./c10-recalculate.js";
import type { Database } from "./index.js";
import { childConfigVersions, familyLinks } from "./schema/family.js";
import { blankPeriods } from "./schema/settings-state.js";

export interface BlankPeriodInput {
  parentId: string;
  childId: string;
  expectedVersion: number;
  name: string;
  startDate: string;
  endDate: string;
}

export interface BlankPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export class BlankPeriodAccessDeniedError extends Error {
  constructor() { super("The caller must be a parent linked to the child."); this.name = "BlankPeriodAccessDeniedError"; }
}
export class BlankPeriodVersionConflictError extends Error {
  constructor() { super("The child configuration changed after it was read."); this.name = "BlankPeriodVersionConflictError"; }
}
export class BlankPeriodNotFoundError extends Error {
  constructor() { super("The blank period does not exist for this child."); this.name = "BlankPeriodNotFoundError"; }
}
export class InvalidBlankPeriodError extends Error {
  constructor() { super("A blank period requires a nonblank name and valid dates."); this.name = "InvalidBlankPeriodError"; }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validate(input: Pick<BlankPeriodInput, "name" | "startDate" | "endDate">): void {
  if (input.name.trim().length === 0 || input.name.length > 120
    || !isCalendarDate(input.startDate) || !isCalendarDate(input.endDate)
    || input.endDate < input.startDate) throw new InvalidBlankPeriodError();
}

async function requireParentLink(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  parentId: string,
  childId: string,
  lockForShare = true,
) {
  const query = tx.select({ id: familyLinks.id }).from(familyLinks)
    .where(and(eq(familyLinks.parentId, parentId), eq(familyLinks.childId, childId)))
    .limit(1);
  const [link] = lockForShare ? await query.for("key share") : await query;
  if (!link) throw new BlankPeriodAccessDeniedError();
}

async function lockVersions(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], childId: string) {
  await tx.insert(childConfigVersions).values({ childId, version: 1 }).onConflictDoNothing({ target: childConfigVersions.childId });
  const [config] = await tx.select({ version: childConfigVersions.version, c10InputVersion: childConfigVersions.c10InputVersion })
    .from(childConfigVersions).where(eq(childConfigVersions.childId, childId)).limit(1).for("update");
  if (!config) throw new Error("Config version row was not available after initialization.");
  return config;
}

async function bumpVersions(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  childId: string,
  config: { version: number; c10InputVersion: number },
) {
  const nextVersion = config.version + 1;
  await tx.update(childConfigVersions).set({
    version: nextVersion,
    c10InputVersion: config.c10InputVersion + 1,
    updatedAt: new Date(),
  }).where(eq(childConfigVersions.childId, childId));
  return nextVersion;
}

export async function listBlankPeriods(db: Database, parentId: string, childId: string) {
  return db.transaction(async (tx) => {
    await requireParentLink(tx, parentId, childId, false);
    const [config] = await tx.select({ version: childConfigVersions.version }).from(childConfigVersions)
      .where(eq(childConfigVersions.childId, childId)).limit(1);
    const periods = await tx.select({ id: blankPeriods.id, name: blankPeriods.name, startDate: blankPeriods.startDate, endDate: blankPeriods.endDate })
      .from(blankPeriods).where(eq(blankPeriods.childId, childId)).orderBy(blankPeriods.startDate, blankPeriods.id);
    return { childId, blankPeriods: periods, configVersion: config?.version ?? 1 };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function createBlankPeriod(db: Database, input: BlankPeriodInput) {
  validate(input);
  return db.transaction(async (tx) => {
    await requireParentLink(tx, input.parentId, input.childId);
    const config = await lockVersions(tx, input.childId);
    if (config.version !== input.expectedVersion) throw new BlankPeriodVersionConflictError();
    const [period] = await tx.insert(blankPeriods).values({
      childId: input.childId,
      name: input.name.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
    }).returning();
    if (!period) throw new Error("The inserted blank period was not returned.");
    const configVersion = await bumpVersions(tx, input.childId, config);
    await recalculateC10InTransaction(tx, input.childId, config.c10InputVersion + 1);
    return { configVersion, changed: true, blankPeriod: period };
  });
}

export async function updateBlankPeriod(db: Database, input: BlankPeriodInput & { id: string }) {
  validate(input);
  return db.transaction(async (tx) => {
    await requireParentLink(tx, input.parentId, input.childId);
    const config = await lockVersions(tx, input.childId);
    if (config.version !== input.expectedVersion) throw new BlankPeriodVersionConflictError();
    const [current] = await tx.select().from(blankPeriods)
      .where(and(eq(blankPeriods.id, input.id), eq(blankPeriods.childId, input.childId)))
      .limit(1).for("update");
    if (!current) throw new BlankPeriodNotFoundError();
    const name = input.name.trim();
    if (current.name === name && current.startDate === input.startDate && current.endDate === input.endDate) {
      return { configVersion: config.version, changed: false, blankPeriod: current };
    }
    const [period] = await tx.update(blankPeriods).set({ name, startDate: input.startDate, endDate: input.endDate, updatedAt: new Date() })
      .where(eq(blankPeriods.id, input.id)).returning();
    if (!period) throw new Error("The locked blank period could not be updated.");
    const configVersion = await bumpVersions(tx, input.childId, config);
    await recalculateC10InTransaction(tx, input.childId, config.c10InputVersion + 1);
    return { configVersion, changed: true, blankPeriod: period };
  });
}

export async function deleteBlankPeriod(db: Database, input: Pick<BlankPeriodInput, "parentId" | "childId" | "expectedVersion"> & { id: string }) {
  return db.transaction(async (tx) => {
    await requireParentLink(tx, input.parentId, input.childId);
    const config = await lockVersions(tx, input.childId);
    if (config.version !== input.expectedVersion) throw new BlankPeriodVersionConflictError();
    const [period] = await tx.delete(blankPeriods)
      .where(and(eq(blankPeriods.id, input.id), eq(blankPeriods.childId, input.childId))).returning({ id: blankPeriods.id });
    if (!period) throw new BlankPeriodNotFoundError();
    const configVersion = await bumpVersions(tx, input.childId, config);
    await recalculateC10InTransaction(tx, input.childId, config.c10InputVersion + 1);
    return { configVersion, changed: true, deletedId: period.id };
  });
}
