import { eq } from "drizzle-orm";
import {
  ExcludedAppsVersionConflictError,
  InvalidExcludedAppsError,
  readExcludedAppsSnapshot,
  replaceExcludedAppsForParent,
} from "../../../backend/src/db/excluded-app-settings.js";
import { ParentChildLinkRequiredError } from "../../../backend/src/db/family-errors.js";
import { childAppliedVersions } from "../../../backend/src/db/schema/settings-state.js";
import { listTestPeriods, TestPeriodAccessDeniedError } from "../../../backend/src/db/test-periods.js";
import type { Caller } from "../auth.js";
import { db } from "../db/index.js";
import { AppError } from "../errors.js";

function mapError(error: unknown): never {
  if (error instanceof ExcludedAppsVersionConflictError) {
    throw new AppError("conflict", "設定が先に変更されています", "一覧を更新してから、もう一度保存してください");
  }
  if (error instanceof InvalidExcludedAppsError) throw new AppError("bad_request");
  if (error instanceof ParentChildLinkRequiredError) throw new AppError("forbidden");
  throw error;
}

export async function getExcludedAppsForCaller(caller: Caller, childId: string) {
  const database = await db();
  try {
    await listTestPeriods(database, caller.userId, childId);
  } catch (error) {
    if (error instanceof TestPeriodAccessDeniedError) throw new AppError("forbidden");
    throw error;
  }
  const [snapshot, [applied]] = await Promise.all([
    readExcludedAppsSnapshot(database, childId),
    database
      .select({ version: childAppliedVersions.version })
      .from(childAppliedVersions)
      .where(eq(childAppliedVersions.childId, childId))
      .limit(1),
  ]);
  return {
    childId,
    apps: snapshot.apps.map((app) => ({ packageName: app.appId, label: app.label, sinceVersion: app.sinceVersion })),
    removedApps: snapshot.removedApps.map((app) => ({
      packageName: app.appId,
      label: app.label,
      removedVersion: app.removedVersion,
    })),
    appsChangedVersion: snapshot.appsChangedVersion,
    configVersion: snapshot.configVersion,
    childAppliedVersion: applied?.version ?? null,
  };
}

export async function saveExcludedAppsForParent(
  caller: Caller,
  input: { childId: string; expectedVersion: number; apps: Array<{ packageName: string; label: string }> },
) {
  try {
    const result = await replaceExcludedAppsForParent(await db(), {
      parentId: caller.userId,
      childId: input.childId,
      expectedVersion: input.expectedVersion,
      appIds: input.apps.map((app) => ({ appId: app.packageName, label: app.label })),
    });
    return {
      apps: result.enabledApps.map((app) => ({
        packageName: app.appId,
        label: app.label,
        sinceVersion: app.sinceVersion,
      })),
      configVersion: result.configVersion,
    };
  } catch (error) {
    mapError(error);
  }
}
