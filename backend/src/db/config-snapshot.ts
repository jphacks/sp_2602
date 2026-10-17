import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./index.js";
import { childConfigVersions } from "./schema/family.js";
import { excludedApps } from "./schema/excluded-apps.js";
import { dailyLimits, planCalculationVersions, planSettings, testPeriods } from "./schema/planning.js";

/** A database-consistent read of the C7 settings for one child. */
export interface ChildConfigSnapshot {
  childId: string;
  configVersion: number | null;
  testPeriods: Array<{
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  }>;
  planSettings: {
    planStartDate: string;
    startLimitMinutes: number;
    finalGoalMinutes: number;
    usualLimitMinutes: number;
  } | null;
  excludedApps: Array<{ appId: string; enabled: boolean }>;
  calculation: {
    version: number;
    sourceConfigVersion: number;
    matchesConfigVersion: boolean;
  } | null;
  dailyLimits: Array<{
    limitDate: string;
    limitMinutes: number;
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
      .select({ version: childConfigVersions.version })
      .from(childConfigVersions)
      .where(eq(childConfigVersions.childId, childId))
      .limit(1);

    const testPeriodsRows = await tx
      .select({
        id: testPeriods.id,
        name: testPeriods.name,
        startDate: testPeriods.startDate,
        endDate: testPeriods.endDate,
      })
      .from(testPeriods)
      .where(eq(testPeriods.childId, childId))
      .orderBy(testPeriods.startDate, testPeriods.id);

    const [settings] = await tx
      .select({
        planStartDate: planSettings.planStartDate,
        startLimitMinutes: planSettings.startLimitMinutes,
        finalGoalMinutes: planSettings.finalGoalMinutes,
        usualLimitMinutes: planSettings.usualLimitMinutes,
      })
      .from(planSettings)
      .where(eq(planSettings.childId, childId))
      .limit(1);

    const excludedAppsRows = await tx
      .select({ appId: excludedApps.appId, enabled: excludedApps.enabled })
      .from(excludedApps)
      .where(eq(excludedApps.childId, childId))
      .orderBy(excludedApps.appId);

    const [latestCalculation] = await tx
      .select({
        version: planCalculationVersions.version,
        sourceConfigVersion: planCalculationVersions.sourceConfigVersion,
      })
      .from(planCalculationVersions)
      .where(eq(planCalculationVersions.childId, childId))
      .orderBy(desc(planCalculationVersions.version))
      .limit(1);

    const dailyLimitRows = latestCalculation
      ? await tx
        .select({
          limitDate: dailyLimits.limitDate,
          limitMinutes: dailyLimits.limitMinutes,
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
      testPeriods: testPeriodsRows,
      planSettings: settings ?? null,
      excludedApps: excludedAppsRows,
      calculation: latestCalculation
        ? {
          ...latestCalculation,
          matchesConfigVersion: config !== undefined
            && latestCalculation.sourceConfigVersion === config.version,
        }
        : null,
      dailyLimits: dailyLimitRows,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
