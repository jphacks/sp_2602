// 保護者が子どもとの連携を外したときの後片付け（セキュリティ検査 F-2 / PII-10・F-7 / IPA-15）。
// src/server/auth.ts の unlinkChild が、連携の行を消したのと同じトランザクションの中で呼ぶ。
//   - clearChildFamilyData: その家庭で作ったデータ（利用記録・設定・アプリ一覧など）を消す。
//     なぜ: 残すと、子どもが別の保護者と紐づけ直したときに、新しい保護者に前の家庭の時期のデータが見える（F-2）。
//     利用者の行（users）・ログインの紐づけ（auth_identities）・QR の記録（pair_tickets）は家庭のデータではないので残す。
//   - recordFamilyUnlink: 誰が・いつ・どの子どもを外したかを audit_events に1行残す（F-7）。
import { eq, sql } from "drizzle-orm";
import type { Database } from "./index.js";
import { auditEvents } from "./schema/audit.js";
import { blockedSiteStates, blockedSites } from "./schema/blocked-sites.js";
import { childAppIcons, childAppListItems, childAppLists } from "./schema/child-apps.js";
import { deviceStatuses } from "./schema/device-status.js";
import { excludedApps } from "./schema/excluded-apps.js";
import { childConfigVersions } from "./schema/family.js";
import { dailyLimits, planCalculationVersions, planSettings, testPeriods } from "./schema/planning.js";
import { blankPeriods, childUsualLimits, excludedAppStates, removedExcludedApps } from "./schema/settings-state.js";
import { usageDayReports, usageRecords, usageSyncBatches } from "./schema/usage.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const FAMILY_UNLINK_ACTION = "family_unlink";

/**
 * 子どもの、家庭ごとのデータを全部消す（外部キーの順: 子の表から先に消す）。
 * 設定の版（child_config_versions）は消さずに1つ上げる。0 に戻すと、端末が持っている前の版より小さくなり、
 * 次の家庭の設定を「古い」と見て取り込まないおそれがあるため。テスト期間・空白期間の一覧が変わった版も、上げた版にする。
 * 子どもの端末が最後に取り込んだ版（child_applied_versions）は版の数だけで中身がないので残す（上げた版より小さいので「反映待ち」になる）。
 */
export async function clearChildFamilyData(tx: Tx, childId: string): Promise<void> {
  // 利用記録（C8）: アプリごとの行 → 日ごとの行 → 送信の記録
  await tx.delete(usageRecords).where(eq(usageRecords.childId, childId));
  await tx.delete(usageDayReports).where(eq(usageDayReports.childId, childId));
  await tx.delete(usageSyncBatches).where(eq(usageSyncBatches.childId, childId));
  // 1日の上限（C10）: 日ごとの行 → 計算の版
  await tx.delete(dailyLimits).where(eq(dailyLimits.childId, childId));
  await tx.delete(planCalculationVersions).where(eq(planCalculationVersions.childId, childId));
  // 計画・通常上限・テスト期間・空白期間
  await tx.delete(planSettings).where(eq(planSettings.childId, childId));
  await tx.delete(childUsualLimits).where(eq(childUsualLimits.childId, childId));
  await tx.delete(testPeriods).where(eq(testPeriods.childId, childId));
  await tx.delete(blankPeriods).where(eq(blankPeriods.childId, childId));
  // 対象外アプリ・制限する Web サイト
  await tx.delete(excludedApps).where(eq(excludedApps.childId, childId));
  await tx.delete(removedExcludedApps).where(eq(removedExcludedApps.childId, childId));
  await tx.delete(excludedAppStates).where(eq(excludedAppStates.childId, childId));
  await tx.delete(blockedSites).where(eq(blockedSites.childId, childId));
  await tx.delete(blockedSiteStates).where(eq(blockedSiteStates.childId, childId));
  // 端末のアプリ一覧とアイコン（Q15）。中身の表は外部キーの cascade でも消えるが、はっきり消しておく
  await tx.delete(childAppIcons).where(eq(childAppIcons.childId, childId));
  await tx.delete(childAppListItems).where(eq(childAppListItems.childId, childId));
  await tx.delete(childAppLists).where(eq(childAppLists.childId, childId));
  // 端末の許可の状態（D-113）。紐づけ直せば端末がすぐ送り直す
  await tx.delete(deviceStatuses).where(eq(deviceStatuses.childId, childId));
  // 設定の版を1つ上げる（端末に「設定が変わった＝空になった」と伝える）
  await tx
    .update(childConfigVersions)
    .set({
      version: sql`${childConfigVersions.version} + 1`,
      c10InputVersion: sql`${childConfigVersions.c10InputVersion} + 1`,
      testPeriodsChangedVersion: sql`${childConfigVersions.version} + 1`,
      blankPeriodsChangedVersion: sql`${childConfigVersions.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(childConfigVersions.childId, childId));
}

/** 連携を外した記録を1行残す（誰が = 保護者の id、いつ = サーバの時計、どの子ども）。 */
export async function recordFamilyUnlink(tx: Tx, parentId: string, childId: string): Promise<void> {
  await tx.insert(auditEvents).values({
    action: FAMILY_UNLINK_ACTION,
    actorUserId: parentId,
    childId,
    createdAt: new Date(),
  });
}
