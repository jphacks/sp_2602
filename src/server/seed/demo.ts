// 見本のデータを DB に入れる仕組み（MOCK の代わり）。処理（API）は MOCK でも本番でも同じ DB の処理を通り、違うのは DB の中身だけ。
//   - seedMockAccounts: MOCK=1 のとき、DB を開いたときに1回だけ呼ぶ（src/server/db/index.ts）。デモの3人（contracts/fixtures.ts の
//     mockSessions。合言葉は固定）を作り、保護者と子どもを連携済みにして、seedDemoFamily で見本を入れる。もう入っていれば何もしない。
//     デモの子どもの「端末のアプリ一覧」（Q15。親16 の候補）の見本もここで入れる（seedDemoFamily では入れない。下の説明）
//   - seedDemoFamily: 連携済みの親子1組に、画面の確認・デモ用の見本（通常上限・2週間前に始まった計画・テスト・対象外アプリ・
//     過去6日の利用記録）を入れる。本番の DB（Neon）でも、Google でログインして紐づけた親子に入れられる（npm run db:seed-demo）
// 見本の値は、前の MOCK（メモリの上の仮のデータの置き場。今は消した）の見本と同じ。
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { replaceChildApps } from "../../../backend/src/db/child-apps.js";
import { replaceExcludedAppsForParent } from "../../../backend/src/db/excluded-app-settings.js";
import { savePlanSettingsForParent, saveUsualLimitForParent } from "../../../backend/src/db/plan-settings.js";
import {
  authIdentities,
  childConfigVersions,
  dailyLimits,
  familyLinks,
  planCalculationVersions,
  userSessions,
  users,
} from "../../../backend/src/db/schema/index.js";
import { createTestPeriod } from "../../../backend/src/db/test-periods.js";
import { persistUsageSubmission } from "../../../backend/src/db/usage-persistence.js";
import { addDays, todayString } from "../../../contracts/dates.js";
import {
  demoAppMinutes,
  demoUsageDay,
  demoUserIds,
  mockExcludedAppCandidates,
  mockSessions,
} from "../../../contracts/fixtures.js";
import { digest } from "../auth/digest.js";
import type { Db } from "../db/index.js";
import { computeDailyLimits } from "../plan/daily-limits.js";

// デモの3人を作り、保護者と子どもを連携済みにして見本を入れる。デモの保護者がもういれば何もしない（false を返す）
export async function seedMockAccounts(d: Db): Promise<boolean> {
  const [exists] = await d.select({ id: users.id }).from(users).where(eq(users.id, demoUserIds.parent)).limit(1);
  if (exists) return false;
  const now = new Date();
  await d.transaction(async (tx) => {
    for (const [idToken, s] of Object.entries(mockSessions)) {
      await tx.insert(users).values({ id: s.userId, role: s.role, displayName: s.name });
      await tx.insert(authIdentities).values({ userId: s.userId, provider: "mock", subject: idToken });
      await tx
        .insert(userSessions)
        .values({ userId: s.userId, tokenHash: digest(s.token), createdAt: now, lastUsedAt: now });
    }
    await tx.insert(familyLinks).values({ parentId: demoUserIds.parent, childId: demoUserIds.child });
    await tx.insert(childConfigVersions).values({ childId: demoUserIds.child });
  });
  await seedDemoFamily(d, { parentId: demoUserIds.parent, childId: demoUserIds.child });
  await seedDemoChildApps(d, demoUserIds.child);
  return true;
}

// デモの子どもの「端末のアプリ一覧」（Q15）の見本: 親16 の Figma の4つ＋見本の使用時間のアプリ（同じアプリは1つ）。
// MOCK のデモの子どもにだけ入れる。なぜ: seedDemoFamily は本番の DB の本物の親子にも使う（npm run db:seed-demo）。
//   本物の子どもの端末の一覧を見本で上書きすると、届いていない一覧を見本で埋めることになるため（D-110）
async function seedDemoChildApps(d: Db, childId: string): Promise<void> {
  const apps = new Map<string, string>();
  for (const a of [...mockExcludedAppCandidates, ...demoAppMinutes])
    if (!apps.has(a.packageName)) apps.set(a.packageName, a.label);
  await replaceChildApps(d, {
    childId,
    apps: [...apps].map(([appId, label]) => ({ appId, label })),
    receivedAt: new Date(),
  });
}

// 連携済みの親子1組に見本を入れる。計画・通常上限・テスト・対象外アプリは上書き、利用記録は過去6日ぶんを足す
// （その日にもっと新しい測定が入っていれば、そちらが残る。C8 の「新しく測った方が正」）
export async function seedDemoFamily(d: Db, family: { parentId: string; childId: string }): Promise<void> {
  const { parentId, childId } = family;
  const today = todayString(new Date());
  const [config] = await d
    .select({ version: childConfigVersions.version })
    .from(childConfigVersions)
    .where(eq(childConfigVersions.childId, childId))
    .limit(1);
  await saveUsualLimitForParent(d, {
    parentId,
    childId,
    expectedVersion: config?.version ?? 1,
    usualLimitMinutes: 180,
  });
  // 見本として2週間前に始まった計画を入れる（画面の確認用。アプリからの保存では開始日は今日以降。Q14）
  const plan = { planStartDate: addDays(today, -14), startLimitMinutes: 300, finalGoalMinutes: 120 };
  await savePlanSettingsForParent(d, { parentId, childId, ...plan });
  const test = { name: "数学", startDate: addDays(today, 11), endDate: addDays(today, 13) };
  await createTestPeriod(d, { actorId: parentId, childId, ...test });
  await fillPastLimits(d, childId, {
    usualLimitMinutes: 180,
    plan,
    testPeriods: [test],
    blankPeriods: [],
  });
  await replaceExcludedAppsForParent(d, {
    parentId,
    childId,
    appIds: [{ appId: "com.example.studynote", label: "学習ノート" }],
  });
  for (let i = 6; i >= 1; i--) {
    const date = addDays(today, -i);
    await persistUsageSubmission(d, {
      submissionId: randomUUID(),
      childId,
      days: [demoUsageDay(date, `${date}T12:00:00.000Z`)],
    });
  }
}

// 過去14日の日別上限も見本として入れる（本物では、その日に作られた値が確定値として残る）。
// 今の計算の版に足す（このあとの再計算でも、今日より前の日は前の値のまま引き継がれる。Q4）
async function fillPastLimits(d: Db, childId: string, input: Parameters<typeof computeDailyLimits>[0]): Promise<void> {
  const today = todayString(new Date());
  const [latest] = await d
    .select({ version: planCalculationVersions.version })
    .from(planCalculationVersions)
    .where(eq(planCalculationVersions.childId, childId))
    .orderBy(desc(planCalculationVersions.version))
    .limit(1);
  if (!latest) return;
  const past = computeDailyLimits(input, addDays(today, -14), addDays(today, -1));
  const rows = past.map((limit) => ({
    childId,
    limitDate: limit.date,
    limitKind: limit.kind,
    limitMinutes: limit.kind === "limited" ? limit.limitMinutes : null,
    blankPeriodId: limit.kind === "unlimited" ? limit.blankPeriodId : null,
    isFinalized: true,
    calculationVersion: latest.version,
  }));
  if (rows.length) await d.insert(dailyLimits).values(rows).onConflictDoNothing();
}
