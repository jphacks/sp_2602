import { addDays, todayString } from "../../../contracts/dates.js";
import { and, desc, eq } from "drizzle-orm";
import { computeDailyLimits, LIMIT_HORIZON_DAYS, mergeWithFinalized, PlanCalcError } from "../../../src/server/plan/daily-limits.js";
import type { DailyLimit } from "../../../contracts/schemas.js";
import type { Database } from "./index.js";
import { childConfigVersions } from "./schema/family.js";
import { dailyLimits, planCalculationVersions, planSettings, testPeriods } from "./schema/planning.js";
import { blankPeriods, childUsualLimits } from "./schema/settings-state.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export class C10CalculationInputError extends Error {
  readonly code = "invalid_c10_inputs";
  constructor(message: string) {
    super(message);
    this.name = "C10CalculationInputError";
  }
}

/** Recalculate and persist D6 plus its source input version inside the caller's transaction. */
export async function recalculateC10InTransaction(
  tx: Transaction,
  childId: string,
  sourceC10InputVersion: number,
  now: Date = new Date(),
): Promise<void> {
  const [settings] = await tx.select({
    planStartDate: planSettings.planStartDate,
    startLimitMinutes: planSettings.startLimitMinutes,
    finalGoalMinutes: planSettings.finalGoalMinutes,
  }).from(planSettings).where(eq(planSettings.childId, childId)).limit(1);
  const [usual] = await tx.select({ minutes: childUsualLimits.minutes })
    .from(childUsualLimits).where(eq(childUsualLimits.childId, childId)).limit(1);
  const periods = await tx.select({ startDate: testPeriods.startDate, endDate: testPeriods.endDate })
    .from(testPeriods).where(eq(testPeriods.childId, childId)).orderBy(testPeriods.startDate);
  const blanks = await tx.select({ id: blankPeriods.id, startDate: blankPeriods.startDate, endDate: blankPeriods.endDate })
    .from(blankPeriods).where(eq(blankPeriods.childId, childId)).orderBy(blankPeriods.startDate);

  const [latest] = await tx.select({ version: planCalculationVersions.version })
    .from(planCalculationVersions).where(eq(planCalculationVersions.childId, childId))
    .orderBy(desc(planCalculationVersions.version)).limit(1);
  const previous = latest
    ? await tx.select({
      date: dailyLimits.limitDate,
      kind: dailyLimits.limitKind,
      minutes: dailyLimits.limitMinutes,
      blankPeriodId: dailyLimits.blankPeriodId,
    })
      .from(dailyLimits).where(and(
        eq(dailyLimits.childId, childId),
        eq(dailyLimits.calculationVersion, latest.version),
      )).orderBy(dailyLimits.limitDate)
    : [];
  const existing: DailyLimit[] = [];
  for (const { date, kind, minutes, blankPeriodId } of previous) {
    if (kind === "unlimited" && blankPeriodId) existing.push({ date, kind: "unlimited", blankPeriodId });
    else if (minutes !== null) existing.push({ date, kind: "limited", limitMinutes: minutes });
  }

  let computed;
  try {
    computed = computeDailyLimits({
      usualLimitMinutes: usual?.minutes ?? null,
      plan: settings ? {
        planStartDate: settings.planStartDate,
        startLimitMinutes: settings.startLimitMinutes,
        finalGoalMinutes: settings.finalGoalMinutes,
      } : null,
      testPeriods: periods,
      blankPeriods: blanks,
    }, todayString(now), addDays(todayString(now), LIMIT_HORIZON_DAYS));
  } catch (error) {
    if (error instanceof PlanCalcError) throw new C10CalculationInputError(error.message);
    throw error;
  }

  // Today's finalized row is retained. If a child has no row for today yet, the
  // initial calculation may fill it; all later mutable dates use the new inputs.
  const merged: DailyLimit[] = mergeWithFinalized(existing, computed, addDays(todayString(now), 1));
  const [config] = await tx.select({ c10InputVersion: childConfigVersions.c10InputVersion })
    .from(childConfigVersions).where(eq(childConfigVersions.childId, childId)).limit(1);
  if (!config || config.c10InputVersion !== sourceC10InputVersion) {
    throw new Error("C10 input version changed while its calculation was being saved.");
  }

  const version = (latest?.version ?? 0) + 1;
  await tx.insert(planCalculationVersions).values({ childId, version, sourceC10InputVersion });
  const rows = merged.map((limit) => limit.kind === "limited"
    ? {
      childId,
      limitDate: limit.date,
      limitKind: limit.kind,
      limitMinutes: limit.limitMinutes,
      isFinalized: limit.date <= todayString(now),
      blankPeriodId: null,
      calculationVersion: version,
    }
    : {
      childId,
      limitDate: limit.date,
      limitKind: limit.kind,
      limitMinutes: null,
      isFinalized: limit.date <= todayString(now),
      blankPeriodId: limit.blankPeriodId,
      calculationVersion: version,
    });
  if (rows.length) await tx.insert(dailyLimits).values(rows);
}
