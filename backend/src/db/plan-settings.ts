import { and, eq } from "drizzle-orm";
import { recalculateC10InTransaction } from "./c10-recalculate.js";
import type { Database } from "./index.js";
import { ParentChildLinkRequiredError } from "./family-errors.js";
import { childConfigVersions, familyLinks } from "./schema/family.js";
import { planSettings } from "./schema/planning.js";
import { childUsualLimits } from "./schema/settings-state.js";

export interface SavePlanSettingsInput {
  /** Must come from the authenticated caller context, not an untrusted request field. */
  parentId: string;
  childId: string;
  expectedVersion?: number;
  planStartDate: string;
  startLimitMinutes: number;
  finalGoalMinutes: number;
  usualLimitMinutes?: number;
}

export interface SavePlanSettingsResult {
  configVersion: number;
  changed: boolean;
}

export class InvalidPlanSettingsError extends Error {
  readonly code = "invalid_plan_settings";

  constructor() {
    super("Plan settings require a valid calendar date and nonnegative integer minute values.");
    this.name = "InvalidPlanSettingsError";
  }
}

export class PlanSettingsVersionConflictError extends Error {
  readonly code = "config_version_conflict";
  constructor() { super("The child configuration changed after it was read."); this.name = "PlanSettingsVersionConflictError"; }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validate(input: SavePlanSettingsInput): void {
  if (!isCalendarDate(input.planStartDate)) throw new InvalidPlanSettingsError();
  const limits = [input.startLimitMinutes, input.finalGoalMinutes, input.usualLimitMinutes].filter((value): value is number => value !== undefined);
  if (limits.some((value) => !Number.isInteger(value) || value < 0 || value > 1440)) {
    throw new InvalidPlanSettingsError();
  }
}

/** Save the parent's D8 settings and advance the shared C7 config version atomically. */
export async function savePlanSettingsForParent(
  db: Database,
  input: SavePlanSettingsInput,
): Promise<SavePlanSettingsResult> {
  validate(input);

  return db.transaction(async (tx) => {
    const [link] = await tx
      .select({ id: familyLinks.id })
      .from(familyLinks)
      .where(and(
        eq(familyLinks.parentId, input.parentId),
        eq(familyLinks.childId, input.childId),
      ))
      .limit(1)
      .for("key share");
    if (!link) throw new ParentChildLinkRequiredError();

    await tx
      .insert(childConfigVersions)
      .values({ childId: input.childId, version: 1 })
      .onConflictDoNothing({ target: childConfigVersions.childId });

    const [config] = await tx
      .select({ version: childConfigVersions.version, c10InputVersion: childConfigVersions.c10InputVersion })
      .from(childConfigVersions)
      .where(eq(childConfigVersions.childId, input.childId))
      .limit(1)
      .for("update");
    if (!config) throw new Error("Config version row was not available after initialization.");
    if (input.expectedVersion !== undefined && config.version !== input.expectedVersion) throw new PlanSettingsVersionConflictError();

    const [current] = await tx
      .select({
        configVersion: planSettings.configVersion,
        planStartDate: planSettings.planStartDate,
        startLimitMinutes: planSettings.startLimitMinutes,
        finalGoalMinutes: planSettings.finalGoalMinutes,
      })
      .from(planSettings)
      .where(eq(planSettings.childId, input.childId))
      .limit(1);
    const [currentUsualLimit] = await tx.select({ minutes: childUsualLimits.minutes })
      .from(childUsualLimits).where(eq(childUsualLimits.childId, input.childId)).limit(1);

    const changed = !current
      || current.planStartDate !== input.planStartDate
      || current.startLimitMinutes !== input.startLimitMinutes
      || current.finalGoalMinutes !== input.finalGoalMinutes
      || (input.usualLimitMinutes !== undefined && currentUsualLimit?.minutes !== input.usualLimitMinutes);
    if (!changed) return { configVersion: config.version, changed: false };

    const nextVersion = config.version + 1;
    const updatedAt = new Date();
    await tx
      .update(childConfigVersions)
      .set({ version: nextVersion, c10InputVersion: config.c10InputVersion + 1, updatedAt })
      .where(eq(childConfigVersions.childId, input.childId));

    await tx
      .insert(planSettings)
      .values({
        childId: input.childId,
        configVersion: nextVersion,
        planStartDate: input.planStartDate,
        startLimitMinutes: input.startLimitMinutes,
        finalGoalMinutes: input.finalGoalMinutes,
        usualLimitMinutes: input.usualLimitMinutes ?? currentUsualLimit?.minutes ?? 0,
        updatedByUserId: input.parentId,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: planSettings.childId,
        set: {
          configVersion: nextVersion,
          planStartDate: input.planStartDate,
          startLimitMinutes: input.startLimitMinutes,
          finalGoalMinutes: input.finalGoalMinutes,
          usualLimitMinutes: input.usualLimitMinutes ?? currentUsualLimit?.minutes ?? 0,
          updatedByUserId: input.parentId,
          updatedAt,
        },
      });

    if (input.usualLimitMinutes !== undefined) await tx.insert(childUsualLimits).values({
      childId: input.childId,
      minutes: input.usualLimitMinutes,
      updatedByUserId: input.parentId,
      updatedAt,
    }).onConflictDoUpdate({
      target: childUsualLimits.childId,
      set: { minutes: input.usualLimitMinutes, updatedByUserId: input.parentId, updatedAt },
    });

    await recalculateC10InTransaction(tx, input.childId, config.c10InputVersion + 1);

    return { configVersion: nextVersion, changed: true };
  });
}

export async function saveUsualLimitForParent(
  db: Database,
  input: { parentId: string; childId: string; expectedVersion: number; usualLimitMinutes: number },
): Promise<SavePlanSettingsResult> {
  if (!Number.isInteger(input.usualLimitMinutes) || input.usualLimitMinutes < 0 || input.usualLimitMinutes > 1440) {
    throw new InvalidPlanSettingsError();
  }
  return db.transaction(async (tx) => {
    const [link] = await tx.select({ id: familyLinks.id }).from(familyLinks)
      .where(and(eq(familyLinks.parentId, input.parentId), eq(familyLinks.childId, input.childId)))
      .limit(1).for("key share");
    if (!link) throw new ParentChildLinkRequiredError();

    await tx.insert(childConfigVersions).values({ childId: input.childId, version: 1 })
      .onConflictDoNothing({ target: childConfigVersions.childId });
    const [config] = await tx.select({ version: childConfigVersions.version, c10InputVersion: childConfigVersions.c10InputVersion })
      .from(childConfigVersions).where(eq(childConfigVersions.childId, input.childId)).limit(1).for("update");
    if (!config) throw new Error("Config version row was not available after initialization.");
    if (config.version !== input.expectedVersion) throw new PlanSettingsVersionConflictError();

    const [current] = await tx.select({ minutes: childUsualLimits.minutes }).from(childUsualLimits)
      .where(eq(childUsualLimits.childId, input.childId)).limit(1);
    if (current?.minutes === input.usualLimitMinutes) return { configVersion: config.version, changed: false };

    const nextVersion = config.version + 1;
    const updatedAt = new Date();
    await tx.update(childConfigVersions).set({
      version: nextVersion,
      c10InputVersion: config.c10InputVersion + 1,
      updatedAt,
    }).where(eq(childConfigVersions.childId, input.childId));
    await tx.insert(childUsualLimits).values({
      childId: input.childId,
      minutes: input.usualLimitMinutes,
      updatedByUserId: input.parentId,
      updatedAt,
    }).onConflictDoUpdate({
      target: childUsualLimits.childId,
      set: { minutes: input.usualLimitMinutes, updatedByUserId: input.parentId, updatedAt },
    });
    await tx.update(planSettings).set({ usualLimitMinutes: input.usualLimitMinutes })
      .where(eq(planSettings.childId, input.childId));
    await recalculateC10InTransaction(tx, input.childId, config.c10InputVersion + 1);
    return { configVersion: nextVersion, changed: true };
  });
}
