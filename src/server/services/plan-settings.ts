import { eq } from "drizzle-orm";
import { C10CalculationInputError } from "../../../backend/src/db/c10-recalculate.js";
import { readChildConfigSnapshot } from "../../../backend/src/db/config-snapshot.js";
import { ParentChildLinkRequiredError } from "../../../backend/src/db/family-errors.js";
import {
  InvalidPlanSettingsError,
  PlanSettingsVersionConflictError,
  savePlanSettingsForParent,
  saveUsualLimitForParent,
} from "../../../backend/src/db/plan-settings.js";
import { childAppliedVersions } from "../../../backend/src/db/schema/settings-state.js";
import { listTestPeriods, TestPeriodAccessDeniedError } from "../../../backend/src/db/test-periods.js";
import { todayString } from "../../../contracts/dates.js";
import type { Caller } from "../auth.js";
import { db } from "../db/index.js";
import { AppError } from "../errors.js";
import { currentC10CalculationVersion } from "./c10-version.js";

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
    configVersion: snapshot.configVersion ?? 0,
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
  // Q14: 開始日は今日（日本時間）以降。G ≤ S は契約（PlanSave）が確かめる
  // TODO(未決): 始まった計画の S・G だけを変えたいとき、開始日が昨日以前になって保存できない（Q14 の「開始日は今日以降」をそのまま守っている）
  if (input.planStartDate < todayString(new Date()))
    throw new AppError("bad_request", "計画開始日は今日以降にしてください", "開始日を選び直してください");
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
