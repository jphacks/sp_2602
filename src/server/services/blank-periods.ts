import { eq } from "drizzle-orm";
import {
  BlankPeriodAccessDeniedError,
  BlankPeriodNotFoundError,
  BlankPeriodVersionConflictError,
  createBlankPeriod,
  deleteBlankPeriod,
  InvalidBlankPeriodError,
  listBlankPeriods,
  updateBlankPeriod,
} from "../../../backend/src/db/blank-periods.js";
import { C10CalculationInputError } from "../../../backend/src/db/c10-recalculate.js";
import { childConfigVersions } from "../../../backend/src/db/schema/family.js";
import { childAppliedVersions } from "../../../backend/src/db/schema/settings-state.js";
import { type Caller, isUuid } from "../auth.js";
import { db } from "../db/index.js";
import { AppError } from "../errors.js";
import { currentC10CalculationVersion } from "./c10-version.js";

function mapError(error: unknown): never {
  if (error instanceof C10CalculationInputError)
    throw new AppError("bad_request", error.message, "入力を確認してください");
  if (error instanceof BlankPeriodAccessDeniedError) throw new AppError("forbidden");
  if (error instanceof BlankPeriodVersionConflictError)
    throw new AppError("conflict", "設定が先に変更されています", "一覧を更新してから、もう一度保存してください");
  if (error instanceof BlankPeriodNotFoundError)
    throw new AppError("not_found", "この空白期間は見つかりません", "一覧を更新してください");
  if (error instanceof InvalidBlankPeriodError) throw new AppError("bad_request");
  throw error;
}

export async function listBlankPeriodsForParent(caller: Caller, childId: string) {
  try {
    const database = await db();
    const [result, [applied], [changed]] = await Promise.all([
      listBlankPeriods(database, caller.userId, childId),
      database
        .select({ version: childAppliedVersions.version })
        .from(childAppliedVersions)
        .where(eq(childAppliedVersions.childId, childId))
        .limit(1),
      database
        .select({ version: childConfigVersions.blankPeriodsChangedVersion })
        .from(childConfigVersions)
        .where(eq(childConfigVersions.childId, childId))
        .limit(1),
    ]);
    return { ...result, blankChangedVersion: changed?.version ?? 0, childAppliedVersion: applied?.version ?? null };
  } catch (error) {
    mapError(error);
  }
}

export async function createBlankPeriodForParent(
  caller: Caller,
  input: {
    childId: string;
    expectedVersion: number;
    name: string;
    startDate: string;
    endDate: string;
  },
) {
  try {
    const result = await createBlankPeriod(await db(), { parentId: caller.userId, ...input });
    return {
      configVersion: result.configVersion,
      calculationVersion: await currentC10CalculationVersion(input.childId),
      blankPeriod: result.blankPeriod,
    };
  } catch (error) {
    mapError(error);
  }
}

export async function updateBlankPeriodForParent(
  caller: Caller,
  input: {
    childId: string;
    expectedVersion: number;
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  },
) {
  if (!isUuid(input.id)) throw new AppError("not_found", "この空白期間は見つかりません", "一覧を更新してください");
  try {
    const result = await updateBlankPeriod(await db(), { parentId: caller.userId, ...input });
    return {
      configVersion: result.configVersion,
      calculationVersion: await currentC10CalculationVersion(input.childId),
      blankPeriod: {
        id: result.blankPeriod.id,
        name: result.blankPeriod.name,
        startDate: result.blankPeriod.startDate,
        endDate: result.blankPeriod.endDate,
      },
    };
  } catch (error) {
    mapError(error);
  }
}

export async function deleteBlankPeriodForParent(
  caller: Caller,
  input: { childId: string; expectedVersion: number; id: string },
) {
  if (!isUuid(input.id)) throw new AppError("not_found", "この空白期間は見つかりません", "一覧を更新してください");
  try {
    const result = await deleteBlankPeriod(await db(), { parentId: caller.userId, ...input });
    return {
      deletedId: result.deletedId,
      configVersion: result.configVersion,
      calculationVersion: await currentC10CalculationVersion(input.childId),
    };
  } catch (error) {
    mapError(error);
  }
}
