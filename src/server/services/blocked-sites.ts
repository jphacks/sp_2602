// 制限する Web サイト（D-111）。対象外アプリ（excluded-apps.ts）と同じ作り。
// 誰が呼べるかは route.ts が先に確かめる（入力の childId: 子どもは自分だけ・保護者は連携済みだけ。保存は契約の auth: parent）。
// 保存は DB のトランザクションの中でも親子の連携を確かめ直す（backend/src/db/blocked-sites.ts）。
import { eq } from "drizzle-orm";
import {
  BlockedSitesVersionConflictError,
  InvalidBlockedSitesError,
  readBlockedSitesSnapshot,
  replaceBlockedSitesForParent,
} from "../../../backend/src/db/blocked-sites.js";
import { ParentChildLinkRequiredError } from "../../../backend/src/db/family-errors.js";
import { childAppliedVersions } from "../../../backend/src/db/schema/settings-state.js";
import { listTestPeriods, TestPeriodAccessDeniedError } from "../../../backend/src/db/test-periods.js";
import type { Caller } from "../auth.js";
import { db } from "../db/index.js";
import { AppError } from "../errors.js";

function mapError(error: unknown): never {
  if (error instanceof BlockedSitesVersionConflictError) {
    throw new AppError("conflict", "設定が先に変更されています", "一覧を更新してから、もう一度保存してください");
  }
  if (error instanceof InvalidBlockedSitesError) throw new AppError("bad_request");
  if (error instanceof ParentChildLinkRequiredError) throw new AppError("forbidden");
  throw error;
}

export async function getBlockedSitesForCaller(caller: Caller, childId: string) {
  const database = await db();
  // 呼んだ人がこの子どもを扱えるかを DB の親子の連携で確かめ直す（対象外アプリの取得と同じ）
  try {
    await listTestPeriods(database, caller.userId, childId);
  } catch (error) {
    if (error instanceof TestPeriodAccessDeniedError) throw new AppError("forbidden");
    throw error;
  }
  const [snapshot, [applied]] = await Promise.all([
    readBlockedSitesSnapshot(database, childId),
    database
      .select({ version: childAppliedVersions.version })
      .from(childAppliedVersions)
      .where(eq(childAppliedVersions.childId, childId))
      .limit(1),
  ]);
  return {
    childId,
    sites: snapshot.sites,
    sitesChangedVersion: snapshot.sitesChangedVersion,
    configVersion: snapshot.configVersion,
    childAppliedVersion: applied?.version ?? null,
  };
}

export async function saveBlockedSitesForParent(
  caller: Caller,
  input: { childId: string; expectedVersion: number; sites: string[] },
) {
  try {
    const result = await replaceBlockedSitesForParent(await db(), {
      parentId: caller.userId,
      childId: input.childId,
      expectedVersion: input.expectedVersion,
      patterns: input.sites,
    });
    return {
      sites: result.sites,
      sitesChangedVersion: result.sitesChangedVersion,
      configVersion: result.configVersion,
    };
  } catch (error) {
    mapError(error);
  }
}
