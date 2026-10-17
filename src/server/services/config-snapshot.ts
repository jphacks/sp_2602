import { inArray } from "drizzle-orm";
import { readChildConfigSnapshot } from "../../../backend/src/db/config-snapshot.js";
import { childAppliedVersions } from "../../../backend/src/db/schema/settings-state.js";
import { users } from "../../../backend/src/db/schema/users.js";
import { listTestPeriods, TestPeriodAccessDeniedError } from "../../../backend/src/db/test-periods.js";
import type { Caller } from "../auth.js";
import { db } from "../db/index.js";
import { AppError } from "../errors.js";

export async function getConfigForCaller(caller: Caller, childId: string, knownVersion?: number) {
  const database = await db();
  // This repository call verifies the authenticated actor against the persisted D2 edge.
  try {
    await listTestPeriods(database, caller.userId, childId);
  } catch (error) {
    if (error instanceof TestPeriodAccessDeniedError) throw new AppError("forbidden");
    throw error;
  }
  const snapshot = await readChildConfigSnapshot(database, childId);
  const configVersion = snapshot.configVersion ?? 0;

  // まだ一度も日別上限を作っていない（紐づけ直後で、通常上限も計画も保存していない）は「未設定」: 計算の版 0・日別上限なし。
  // 作ったことがあるのに今の入力と合わないのは、保存と計算が1回の処理で済んでいない（起きないはず）ので、古い上限を配らずに断る
  if (snapshot.calculation && !snapshot.calculation.matchesC10InputVersion) {
    throw new AppError(
      "upstream_failed",
      "設定は保存されていますが、日別上限の計算が最新ではありません",
      "C10 の日別上限計算を完了してから、もう一度取得してください",
    );
  }

  if (caller.role === "child" && knownVersion !== undefined && knownVersion <= configVersion) {
    await database
      .insert(childAppliedVersions)
      .values({ childId, version: knownVersion, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: childAppliedVersions.childId,
        set: { version: knownVersion, updatedAt: new Date() },
      });
  }

  if (knownVersion === configVersion) return { changed: false as const, configVersion };

  const authors = snapshot.testPeriods.length
    ? await database
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(inArray(users.id, [...new Set(snapshot.testPeriods.map((period) => period.createdByUserId))]))
    : [];
  const authorRoles = new Map(authors.map((row) => [row.id, row.role]));
  const plan = snapshot.planSettings
    ? {
        ...snapshot.planSettings,
        childId,
        version: snapshot.planSettings.configVersion,
        updatedAt: snapshot.planSettings.updatedAt.toISOString(),
      }
    : null;

  return {
    changed: true as const,
    snapshot: {
      childId,
      configVersion,
      calculationVersion: snapshot.calculation?.version ?? 0,
      usualLimitMinutes: snapshot.usualLimitMinutes,
      plan,
      testPeriods: snapshot.testPeriods.map((period) => ({
        ...period,
        createdByRole: authorRoles.get(period.createdByUserId) ?? "child",
      })),
      blankPeriods: snapshot.blankPeriods,
      dailyLimits: snapshot.dailyLimits
        .map((limit) =>
          limit.limitKind === "unlimited" && limit.blankPeriodId
            ? { date: limit.limitDate, kind: "unlimited" as const, blankPeriodId: limit.blankPeriodId }
            : limit.limitMinutes !== null
              ? { date: limit.limitDate, kind: "limited" as const, limitMinutes: limit.limitMinutes }
              : null,
        )
        .filter((limit) => limit !== null),
      excludedApps: snapshot.excludedApps
        .filter((app) => app.enabled)
        .map((app) => ({
          packageName: app.appId,
          label: app.label,
          sinceVersion: app.sinceVersion,
        })),
      generatedAt: new Date().toISOString(),
    },
  };
}
