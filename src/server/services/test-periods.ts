import { eq, inArray } from "drizzle-orm";
import { C10CalculationInputError } from "../../../backend/src/db/c10-recalculate";
import { readChildConfigSnapshot } from "../../../backend/src/db/config-snapshot";
import { childAppliedVersions } from "../../../backend/src/db/schema/settings-state";
import { users } from "../../../backend/src/db/schema/users";
import {
  createTestPeriod,
  deleteTestPeriod,
  InvalidTestPeriodError,
  listTestPeriods,
  TestPeriodAccessDeniedError,
  TestPeriodNotFoundError,
  TestPeriodVersionConflictError,
  updateTestPeriod,
} from "../../../backend/src/db/test-periods";
import type { Caller } from "../auth";
import { db } from "../db";
import { isMock } from "../env";
import { AppError } from "../errors";
import { getStore } from "../mock/store";
import { currentC10CalculationVersion } from "./c10-version";

function mapError(error: unknown): never {
  if (error instanceof C10CalculationInputError)
    throw new AppError("bad_request", error.message, "入力を確認してください");
  if (error instanceof TestPeriodVersionConflictError) {
    throw new AppError("conflict", "設定が先に変更されています", "一覧を更新してから、もう一度保存してください");
  }
  if (error instanceof TestPeriodAccessDeniedError) throw new AppError("forbidden");
  if (error instanceof TestPeriodNotFoundError)
    throw new AppError("not_found", "このテスト期間は見つかりません", "一覧を更新してください");
  if (error instanceof InvalidTestPeriodError) throw new AppError("bad_request");
  throw error;
}

export async function listTestPeriodsForCaller(caller: Caller, childId: string) {
  if (isMock()) return getStore().testPeriods(childId);
  try {
    const database = await db();
    const [snapshot, periods, [applied]] = await Promise.all([
      readChildConfigSnapshot(database, childId),
      listTestPeriods(database, caller.userId, childId),
      database
        .select({ version: childAppliedVersions.version })
        .from(childAppliedVersions)
        .where(eq(childAppliedVersions.childId, childId))
        .limit(1),
    ]);
    const authorIds = [...new Set(periods.map((period) => period.createdByUserId))];
    const authorRows = authorIds.length
      ? await database.select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, authorIds))
      : [];
    const roleById = new Map(authorRows.map((author) => [author.id, author.role]));
    return {
      childId,
      testPeriods: snapshot.testPeriods.map((period) => ({
        id: period.id,
        name: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
        createdByUserId: period.createdByUserId,
        createdByRole: roleById.get(period.createdByUserId) ?? "child",
      })),
      configVersion: snapshot.configVersion ?? 1,
      childAppliedVersion: applied?.version ?? null,
    };
  } catch (error) {
    mapError(error);
  }
}

export async function createTestPeriodForCaller(
  caller: Caller,
  input: { childId: string; expectedVersion: number; name: string; startDate: string; endDate: string },
) {
  if (isMock()) return getStore().testPeriodCreate(caller, input.childId, input.expectedVersion, input);
  try {
    const result = await createTestPeriod(await db(), { actorId: caller.userId, ...input });
    const testPeriod = result.testPeriod;
    if (!testPeriod) throw new Error("The inserted test period was not returned.");
    return {
      testPeriod: {
        id: testPeriod.id,
        name: testPeriod.name,
        startDate: testPeriod.startDate,
        endDate: testPeriod.endDate,
        createdByUserId: testPeriod.createdByUserId,
        createdByRole: caller.role ?? "child",
      },
      configVersion: result.configVersion,
      calculationVersion: await currentC10CalculationVersion(input.childId),
    };
  } catch (error) {
    mapError(error);
  }
}

export async function updateTestPeriodForCaller(
  caller: Caller,
  input: { childId: string; expectedVersion: number; id: string; name: string; startDate: string; endDate: string },
) {
  if (isMock()) return getStore().testPeriodUpdate(input.childId, input.expectedVersion, input);
  try {
    const result = await updateTestPeriod(await db(), {
      actorId: caller.userId,
      childId: input.childId,
      expectedVersion: input.expectedVersion,
      testPeriodId: input.id,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const testPeriod = result.testPeriod;
    if (!testPeriod) throw new Error("The updated test period was not returned.");
    const [author] = await (await db())
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, testPeriod.createdByUserId))
      .limit(1);
    return {
      testPeriod: {
        id: testPeriod.id,
        name: testPeriod.name,
        startDate: testPeriod.startDate,
        endDate: testPeriod.endDate,
        createdByUserId: testPeriod.createdByUserId,
        createdByRole: author?.role ?? "child",
      },
      configVersion: result.configVersion,
      calculationVersion: await currentC10CalculationVersion(input.childId),
    };
  } catch (error) {
    mapError(error);
  }
}

export async function deleteTestPeriodForCaller(
  caller: Caller,
  input: { childId: string; expectedVersion: number; id: string },
) {
  if (isMock()) return getStore().testPeriodDelete(input.childId, input.expectedVersion, input.id);
  try {
    const result = await deleteTestPeriod(await db(), {
      actorId: caller.userId,
      childId: input.childId,
      expectedVersion: input.expectedVersion,
      testPeriodId: input.id,
    });
    if (!result.changed) throw new AppError("not_found", "このテスト期間は見つかりません", "一覧を更新してください");
    return {
      deletedId: input.id,
      configVersion: result.configVersion,
      calculationVersion: await currentC10CalculationVersion(input.childId),
    };
  } catch (error) {
    mapError(error);
  }
}
