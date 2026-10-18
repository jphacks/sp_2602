import { addDays, todayString } from "../../../contracts/dates.js";
import { and, desc, eq, max } from "drizzle-orm";
import {
  computeDailyLimits,
  LIMIT_HORIZON_DAYS,
  LIMIT_TOPUP_MIN_DAYS,
  mergeWithFinalized,
  PlanCalcError,
} from "../../../src/server/plan/daily-limits.js";
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

/**
 * Recalculate and persist D6 plus its source input version inside the caller's transaction.
 * Returns true when a new revision was saved. With onlyIfChanged, nothing is saved (false) when the
 * result equals the latest revision (the top-up must not advance versions for the same limits. D-54 / X-1).
 */
export async function recalculateC10InTransaction(
  tx: Transaction,
  childId: string,
  sourceC10InputVersion: number,
  now: Date = new Date(),
  { onlyIfChanged = false }: { onlyIfChanged?: boolean } = {},
): Promise<boolean> {
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
  // 作り直しても中身が前の版と同じなら保存しない（例: 空白期間だけで通常上限がない子どもは、空白期間の後ろの日が
  // 「上限未設定」なので、何度作り足しても最後の日がしきい値に届かない。そのたびに版を上げると、読むだけで版が上がる。X-1）
  if (onlyIfChanged && latest && sameLimits(existing, merged)) return false;

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
  return true;
}

// 日別上限の2つの並び（どちらも日付順）が、日付・種類・分・空白期間まで同じか
function sameLimits(a: DailyLimit[], b: DailyLimit[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    if (!y || x.date !== y.date || x.kind !== y.kind) return false;
    return x.kind === "limited"
      ? y.kind === "limited" && x.limitMinutes === y.limitMinutes
      : y.kind === "unlimited" && x.blankPeriodId === y.blankPeriodId;
  });
}

type Executor = Database | Transaction;

/** The last date of D6 in the child's latest calculation, or null when C10 never ran for the child. */
async function lastLimitDate(executor: Executor, childId: string): Promise<string | null> {
  const [latest] = await executor.select({ version: planCalculationVersions.version })
    .from(planCalculationVersions).where(eq(planCalculationVersions.childId, childId))
    .orderBy(desc(planCalculationVersions.version)).limit(1);
  if (!latest) return null;
  const [row] = await executor.select({ last: max(dailyLimits.limitDate) }).from(dailyLimits)
    .where(and(eq(dailyLimits.childId, childId), eq(dailyLimits.calculationVersion, latest.version)));
  return row?.last ?? null;
}

/**
 * When fewer than LIMIT_TOPUP_MIN_DAYS of D6 remain, recalculate with the current inputs up to LIMIT_HORIZON_DAYS
 * from today and advance the shared config version, so devices adopt it (C7 only adopts newer versions).
 * Past and today's limits are kept by recalculateC10InTransaction. Returns true when a new revision was saved.
 * A calculation error keeps the previous official revision (the inputs were accepted when saved).
 */
export async function topUpDailyLimits(db: Database, childId: string, now: Date = new Date()): Promise<boolean> {
  const threshold = addDays(todayString(now), LIMIT_TOPUP_MIN_DAYS);
  const before = await lastLimitDate(db, childId);
  if (before === null || before >= threshold) return false;
  try {
    return await db.transaction(async (tx) => {
      const [config] = await tx.select({ version: childConfigVersions.version, c10InputVersion: childConfigVersions.c10InputVersion })
        .from(childConfigVersions).where(eq(childConfigVersions.childId, childId)).limit(1).for("update");
      if (!config) return false;
      // Another request may have topped up while this one waited for the lock.
      const last = await lastLimitDate(tx, childId);
      if (last === null || last >= threshold) return false;
      // 作り足しても日別上限が変わらないとき（上限のない日しか先にない）は、版を上げない（D-54「中身が変わったときだけ」。X-1）
      const saved = await recalculateC10InTransaction(tx, childId, config.c10InputVersion, now, { onlyIfChanged: true });
      if (!saved) return false;
      await tx.update(childConfigVersions).set({ version: config.version + 1, updatedAt: now })
        .where(eq(childConfigVersions.childId, childId));
      return true;
    });
  } catch (error) {
    if (error instanceof C10CalculationInputError) return false;
    throw error;
  }
}
