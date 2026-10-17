import { eq } from "drizzle-orm";
import { C10CalculationInputError } from "../../../backend/src/db/c10-recalculate";
import { readChildConfigSnapshot } from "../../../backend/src/db/config-snapshot";
import { ParentChildLinkRequiredError } from "../../../backend/src/db/family-errors";
import {
  InvalidPlanSettingsError,
  PlanSettingsVersionConflictError,
  savePlanSettingsForParent,
  saveUsualLimitForParent,
} from "../../../backend/src/db/plan-settings";
import { childAppliedVersions } from "../../../backend/src/db/schema/settings-state";
import { listTestPeriods, TestPeriodAccessDeniedError } from "../../../backend/src/db/test-periods";
import type { Caller } from "../auth";
import { db } from "../db";
import { isMock } from "../env";
import { AppError } from "../errors";
import { getStore } from "../mock/store";
import { currentC10CalculationVersion } from "./c10-version";

function mapError(error: unknown): never {
  if (error instanceof C10CalculationInputError)
    throw new AppError("bad_request", error.message, "入力を確認してください");
  if (error instanceof PlanSettingsVersionConflictError)
    throw new AppError("conflict", "設定が先に変更されています", "一覧を更新してから、もう一度保存してください");
  if (error instanceof ParentChildLinkRequiredError) throw new AppError("forbidden");
  if (error instanceof InvalidPlanSettingsError) throw new AppError("bad_request");
  throw error;
}

export async function getPlanForCaller(caller: Caller, childId: string) {
  if (isMock()) return getStore().planView(childId);
  const database = await db();
  try {
    await listTestPeriods(database, caller.userId, childId);
  } catch (error) {
    if (error instanceof TestPeriodAccessDeniedError) throw new AppError("forbidden");
    throw error;
  }
  const [snapshot, [applied]] = await Promise.all([
    readChildConfigSnapshot(database, childId),
    database
      .select({ version: childAppliedVersions.version })
      .from(childAppliedVersions)
      .where(eq(childAppliedVersions.childId, childId))
      .limit(1),
  ]);
  const plan = snapshot.planSettings;
  return {
    childId,
    plan: plan
      ? {
          childId,
          planStartDate: plan.planStartDate,
          startLimitMinutes: plan.startLimitMinutes,
          finalGoalMinutes: plan.finalGoalMinutes,
          version: plan.configVersion,
          updatedAt: plan.updatedAt.toISOString(),
        }
      : null,
    usualLimitMinutes: snapshot.usualLimitMinutes,
    configVersion: snapshot.configVersion ?? 1,
    childAppliedVersion: applied?.version ?? null,
  };
}

export async function savePlanForCaller(
  caller: Caller,
  input: {
    childId: string;
    expectedVersion: number;
    planStartDate: string;
    startLimitMinutes: number;
    finalGoalMinutes: number;
    usualLimitMinutes?: number;
  },
) {
  if (isMock())
    return getStore().planSave(input.childId, input.expectedVersion, {
      planStartDate: input.planStartDate,
      startLimitMinutes: input.startLimitMinutes,
      finalGoalMinutes: input.finalGoalMinutes,
      ...(input.usualLimitMinutes === undefined ? {} : { usualLimitMinutes: input.usualLimitMinutes }),
    });
  try {
    const result = await savePlanSettingsForParent(await db(), { parentId: caller.userId, ...input });
    const snapshot = await readChildConfigSnapshot(await db(), input.childId);
    if (!snapshot.planSettings) throw new Error("Saved plan settings were not returned.");
    return {
      plan: {
        childId: input.childId,
        planStartDate: snapshot.planSettings.planStartDate,
        startLimitMinutes: snapshot.planSettings.startLimitMinutes,
        finalGoalMinutes: snapshot.planSettings.finalGoalMinutes,
        version: snapshot.planSettings.configVersion,
        updatedAt: snapshot.planSettings.updatedAt.toISOString(),
      },
      usualLimitMinutes: snapshot.usualLimitMinutes,
      configVersion: result.configVersion,
      calculationVersion: await currentC10CalculationVersion(input.childId),
    };
  } catch (error) {
    mapError(error);
  }
}

export async function saveUsualLimitForCaller(
  caller: Caller,
  input: {
    childId: string;
    expectedVersion: number;
    usualLimitMinutes: number;
  },
) {
  if (isMock()) return getStore().usualLimitSave(input.childId, input.expectedVersion, input.usualLimitMinutes);
  try {
    const result = await saveUsualLimitForParent(await db(), { parentId: caller.userId, ...input });
    return {
      usualLimitMinutes: input.usualLimitMinutes,
      configVersion: result.configVersion,
      calculationVersion: await currentC10CalculationVersion(input.childId),
    };
  } catch (error) {
    mapError(error);
  }
}
