import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./index.js";
import { childConfigVersions } from "./schema/family.js";
import { excludedApps } from "./schema/excluded-apps.js";
import { dailyLimits, planCalculationVersions, planSettings, testPeriods } from "./schema/planning.js";
import { blankPeriods, childUsualLimits } from "./schema/settings-state.js";

/** A database-consistent read of the C7 settings for one child. */
export interface ChildConfigSnapshot {
  childId: string;
  configVersion: number | null;
  c10InputVersion: number | null;
  testPeriods: Array<{
    id: string;
    createdByUserId: string;
    name: string;
    startDate: string;
    endDate: string;
  }>;
  blankPeriods: Array<{ id: string; name: string; startDate: string; endDate: string }>;
  planSettings: {
    configVersion: number;
    planStartDate: string;
    startLimitMinutes: number;
    finalGoalMinutes: number;
    usualLimitMinutes: number;
    updatedAt: Date;
  } | null;
  usualLimitMinutes: number | null;
  excludedApps: Array<{ appId: string; label: string; sinceVersion: number; enabled: boolean }>;
  calculation: {
    version: number;
    sourceC10InputVersion: number;
    matchesC10InputVersion: boolean;
  } | null;
  dailyLimits: Array<{
    limitDate: string;
    limitKind: string;
    limitMinutes: number | null;
    blankPeriodId: string | null;
    calculationVersion: number;
  }>;
}

/**
 * Read C7 state from one repeatable-read snapshot. A missing config/calculation version
 * is reported explicitly; callers must not treat it as a zero-minute limit.
 * Authorization and config-version increments belong to the service/API layer.
 */
export async function readChildConfigSnapshot(
  db: Database,
  childId: string,
): Promise<ChildConfigSnapshot> {
  return db.transaction(async (tx) => {
    const [config] = await tx
      .select({ version: childConfigVersions.version, c10InputVersion: childConfigVersions.c10InputVersion })
      .from(childConfigVersions)
      .where(eq(childConfigVersions.childId, childId))
      .limit(1);

    const testPeriodsRows = await tx
      .select({
        id: testPeriods.id,
        createdByUserId: testPeriods.createdByUserId,
        name: testPeriods.name,
        startDate: testPeriods.startDate,
        endDate: testPeriods.endDate,
      })
      .from(testPeriods)
      .where(eq(testPeriods.childId, childId))
      .orderBy(testPeriods.startDate, testPeriods.id);

    const blankPeriodRows = await tx
      .select({
        id: blankPeriods.id,
        name: blankPeriods.name,
        startDate: blankPeriods.startDate,
        endDate: blankPeriods.endDate,
      })
      .from(blankPeriods)
      .where(eq(blankPeriods.childId, childId))
      .orderBy(blankPeriods.startDate, blankPeriods.id);

    const [settings] = await tx
      .select({
        configVersion: planSettings.configVersion,
        planStartDate: planSettings.planStartDate,
        startLimitMinutes: planSettings.startLimitMinutes,
        finalGoalMinutes: planSettings.finalGoalMinutes,
        usualLimitMinutes: planSettings.usualLimitMinutes,
        updatedAt: planSettings.updatedAt,
      })
      .from(planSettings)
      .where(eq(planSettings.childId, childId))
      .limit(1);

    const [usualLimit] = await tx.select({ minutes: childUsualLimits.minutes })
      .from(childUsualLimits).where(eq(childUsualLimits.childId, childId)).limit(1);

    const excludedAppsRows = await tx
      .select({ appId: excludedApps.appId, label: excludedApps.label, sinceVersion: excludedApps.sinceVersion, enabled: excludedApps.enabled })
      .from(excludedApps)
      .where(eq(excludedApps.childId, childId))
      .orderBy(excludedApps.appId);

    const [latestCalculation] = await tx
      .select({
        version: planCalculationVersions.version,
        sourceC10InputVersion: planCalculationVersions.sourceC10InputVersion,
      })
      .from(planCalculationVersions)
      .where(eq(planCalculationVersions.childId, childId))
      .orderBy(desc(planCalculationVersions.version))
      .limit(1);

    const dailyLimitRows = latestCalculation
      ? await tx
        .select({
          limitDate: dailyLimits.limitDate,
          limitKind: dailyLimits.limitKind,
          limitMinutes: dailyLimits.limitMinutes,
          blankPeriodId: dailyLimits.blankPeriodId,
          calculationVersion: dailyLimits.calculationVersion,
        })
        .from(dailyLimits)
        .where(and(
          eq(dailyLimits.childId, childId),
          eq(dailyLimits.calculationVersion, latestCalculation.version),
        ))
        .orderBy(dailyLimits.limitDate)
      : [];

    return {
      childId,
      configVersion: config?.version ?? null,
      c10InputVersion: config?.c10InputVersion ?? null,
      testPeriods: testPeriodsRows,
      blankPeriods: blankPeriodRows,
      planSettings: settings ?? null,
      usualLimitMinutes: usualLimit?.minutes ?? null,
      excludedApps: excludedAppsRows,
      calculation: latestCalculation
        ? {
          ...latestCalculation,
          matchesC10InputVersion: config !== undefined
            && latestCalculation.sourceC10InputVersion === config.c10InputVersion,
        }
        : null,
      dailyLimits: dailyLimitRows,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
