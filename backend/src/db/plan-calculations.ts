import { desc, eq, sql } from "drizzle-orm";
import type { Database } from "./index.js";
import { childConfigVersions } from "./schema/family.js";
import { dailyLimits, planCalculationVersions } from "./schema/planning.js";

export interface DailyLimitInput {
  limitDate: string;
  limitMinutes: number;
}

export interface SavePlanCalculationInput {
  childId: string;
  /** Config revision used to produce this result; stale results are rejected. */
  sourceConfigVersion: number;
  /** Complete set of active daily limits for this calculation revision. */
  dailyLimits: DailyLimitInput[];
}

export interface SavePlanCalculationResult {
  version: number;
  sourceConfigVersion: number;
  savedDailyLimitCount: number;
}

export class InvalidPlanCalculationError extends Error {
  readonly code = "invalid_plan_calculation";

  constructor() {
    super("A plan calculation requires a positive source config version and unique valid dates with nonnegative integer limits.");
    this.name = "InvalidPlanCalculationError";
  }
}

export class PlanCalculationConfigNotFoundError extends Error {
  readonly code = "plan_calculation_config_not_found";

  constructor() {
    super("The child has no stored config version to calculate from.");
    this.name = "PlanCalculationConfigNotFoundError";
  }
}

export class StalePlanCalculationConfigError extends Error {
  readonly code = "stale_plan_calculation_config";

  constructor() {
    super("The child's config changed after this plan calculation was prepared.");
    this.name = "StalePlanCalculationConfigError";
  }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validate(input: SavePlanCalculationInput): void {
  if (!Number.isInteger(input.sourceConfigVersion)
    || input.sourceConfigVersion < 1
    || input.sourceConfigVersion > 2_147_483_647
    || !Array.isArray(input.dailyLimits)) {
    throw new InvalidPlanCalculationError();
  }

  const dates = new Set<string>();
  for (const limit of input.dailyLimits) {
    if (!isCalendarDate(limit.limitDate)
      || !Number.isInteger(limit.limitMinutes)
      || limit.limitMinutes < 0
      || limit.limitMinutes > 2_147_483_647
      || dates.has(limit.limitDate)) {
      throw new InvalidPlanCalculationError();
    }
    dates.add(limit.limitDate);
  }
}

/**
 * Persist one C10 calculation revision and its complete active D6 snapshot atomically.
 * The caller supplies calculation results and decides which dates are active; this
 * repository does not decide finalization, time-zone, or recalculation policies.
 */
export async function savePlanCalculation(
  db: Database,
  input: SavePlanCalculationInput,
): Promise<SavePlanCalculationResult> {
  validate(input);

  return db.transaction(async (tx) => {
    const [config] = await tx
      .select({ version: childConfigVersions.version })
      .from(childConfigVersions)
      .where(eq(childConfigVersions.childId, input.childId))
      .limit(1)
      .for("update");
    if (!config) throw new PlanCalculationConfigNotFoundError();
    if (config.version !== input.sourceConfigVersion) {
      throw new StalePlanCalculationConfigError();
    }

    const [latest] = await tx
      .select({ version: planCalculationVersions.version })
      .from(planCalculationVersions)
      .where(eq(planCalculationVersions.childId, input.childId))
      .orderBy(desc(planCalculationVersions.version))
      .limit(1)
      .for("update");
    const version = (latest?.version ?? 0) + 1;
    if (version > 2_147_483_647) throw new InvalidPlanCalculationError();

    await tx.insert(planCalculationVersions).values({
      childId: input.childId,
      version,
      sourceConfigVersion: input.sourceConfigVersion,
    });

    if (input.dailyLimits.length > 0) {
      const updatedAt = new Date();
      await tx.insert(dailyLimits).values(input.dailyLimits.map((limit) => ({
        childId: input.childId,
        limitDate: limit.limitDate,
        limitMinutes: limit.limitMinutes,
        calculationVersion: version,
        updatedAt,
      }))).onConflictDoUpdate({
        target: [dailyLimits.childId, dailyLimits.limitDate],
        set: {
          limitMinutes: sql`excluded.limit_minutes`,
          calculationVersion: version,
          updatedAt,
        },
      });
    }

    return {
      version,
      sourceConfigVersion: input.sourceConfigVersion,
      savedDailyLimitCount: input.dailyLimits.length,
    };
  });
}
