// 確かめ役（V）: 連携を外したあとのデータ（セキュリティ検査 F-2 / PII-10）と、外した記録（F-7 / IPA-15）。
//   - 子C が保護者C1 と連携 → 利用記録・テスト期間・設定・アプリ一覧を作る → C1 が外す → 子C が別の保護者C2 と連携、
//     のとき、C2 には前の家庭の時期のデータが何も見えない（result.md F-2 の手順のとおり）
//   - 外すと、誰が・いつ・どの子どもを外したかが audit_events に1行残る。外せなかったとき（403）は残らない
import { createHash } from "node:crypto";
import { api } from "@contracts/api";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditEvents } from "../../backend/src/db/schema/audit";
import { fresh, link, newFamily, newPerson, ok, post, versionOf } from "./helpers";

const TODAY = "2026-10-15";

beforeEach(async () => {
  await fresh("2026-10-15T03:00:00Z"); // 日本時間 12:00
});

// PNG の頭＋中身。ハッシュは中身の SHA-256（tests/server/api.test.ts と同じ作り方）
const png = (seed: string) => {
  const head = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const bytes = Buffer.concat([head, Buffer.alloc(24, seed)]);
  return { png: bytes.toString("base64"), iconHash: createHash("sha256").update(bytes).digest("hex") };
};
const oldApp = { packageName: "com.example.coldhistory", label: "COldHistoryApp" };

// 前の家庭（C1）の時期のデータを、ひととおり作る
async function fillOldFamily(childId: string, childToken: string, parentToken: string) {
  await ok(
    post(
      "/api/usage/upload",
      {
        submissionId: crypto.randomUUID(),
        childId,
        days: [
          {
            date: TODAY,
            measuredAt: "2026-10-15T02:00:00.000Z",
            restrictedMinutes: 42,
            apps: [{ ...oldApp, usedMinutes: 42, excluded: false }],
          },
        ],
      },
      childToken,
    ),
  );
  const icon = png("old");
  await ok(post("/api/child-apps/upload", { childId, apps: [{ ...oldApp, iconHash: icon.iconHash }] }, childToken));
  await ok(
    post(
      "/api/child-apps/icons/upload",
      { childId, icons: [{ packageName: oldApp.packageName, ...icon }] },
      childToken,
    ),
  );
  await ok(
    post(
      "/api/device-status/report",
      {
        childId,
        permissions: { usageAccess: true, overlay: false, notifications: true, accessibility: true },
        measuredAt: new Date().toISOString(),
      },
      childToken,
    ),
  );

  const period = { startDate: "2026-11-01", endDate: "2026-11-02" };
  let v = await versionOf(childId, parentToken);
  await ok(
    post(
      "/api/plan/save",
      {
        childId,
        expectedVersion: v,
        planStartDate: TODAY,
        startLimitMinutes: 200,
        finalGoalMinutes: 100,
        usualLimitMinutes: 90,
      },
      parentToken,
    ),
  );
  v = await versionOf(childId, parentToken);
  await ok(
    post(
      "/api/test-period/create",
      { childId, expectedVersion: v, name: "旧保護者が作ったテスト", ...period },
      parentToken,
    ),
  );
  v = await versionOf(childId, parentToken);
  await ok(
    post(
      "/api/blank-period/create",
      { childId, expectedVersion: v, name: "旧保護者の空白期間", ...period },
      parentToken,
    ),
  );
  v = await versionOf(childId, parentToken);
  await ok(post("/api/excluded-apps/save", { childId, expectedVersion: v, apps: [oldApp] }, parentToken));
  v = await versionOf(childId, parentToken);
  await ok(post("/api/excluded-apps/save", { childId, expectedVersion: v, apps: [] }, parentToken)); // 外した記録（removedApps）も作る
  v = await versionOf(childId, parentToken);
  await ok(
    post("/api/blocked-sites/save", { childId, expectedVersion: v, sites: ["old-family.example.com"] }, parentToken),
  );
}

// 保護者から見える、その子どものデータ全部
async function parentView(childId: string, parentToken: string) {
  return {
    usage: api.usageGet.res.parse(await ok(post("/api/usage/get", { childId, from: TODAY, to: TODAY }, parentToken))),
    tests: api.testPeriodList.res.parse(await ok(post("/api/test-period/list", { childId }, parentToken))),
    blanks: api.blankPeriodList.res.parse(await ok(post("/api/blank-period/list", { childId }, parentToken))),
    plan: api.planGet.res.parse(await ok(post("/api/plan/get", { childId }, parentToken))),
    excluded: api.excludedAppsGet.res.parse(await ok(post("/api/excluded-apps/get", { childId }, parentToken))),
    sites: api.blockedSitesGet.res.parse(await ok(post("/api/blocked-sites/get", { childId }, parentToken))),
    apps: api.childAppsGet.res.parse(await ok(post("/api/child-apps/get", { childId }, parentToken))),
    icons: api.childAppIconsGet.res.parse(
      await ok(post("/api/child-apps/icons/get", { childId, packageNames: [oldApp.packageName] }, parentToken)),
    ),
    device: api.deviceStatusGet.res.parse(await ok(post("/api/device-status/get", { childId }, parentToken))),
  };
}

describe("V: 連携を外したあと、別の保護者に前の家庭のデータが見えない（F-2 / PII-10）", () => {
  it("子C が C1 と作ったデータは、C1 が外したあとに連携した C2 からは何も見えない", async () => {
    const { child, parent: c1 } = await newFamily("f2");
    await fillOldFamily(child.userId, child.token, c1.token);

    // 前提: C1 にはひととおり見えている
    const before = await parentView(child.userId, c1.token);
    expect(before.usage.days[0]?.apps.map((a) => a.label)).toEqual([oldApp.label]);
    expect(before.tests.testPeriods.map((t) => t.name)).toEqual(["旧保護者が作ったテスト"]);
    expect(before.blanks.blankPeriods).toHaveLength(1);
    expect(before.plan.plan).not.toBeNull();
    expect(before.excluded.removedApps).toHaveLength(1);
    expect(before.sites.sites).toHaveLength(1);
    expect(before.apps.apps.map((a) => a.label)).toEqual([oldApp.label]);
    expect(before.icons.icons).toHaveLength(1);
    expect(before.device.status).not.toBeNull();

    await ok(post("/api/family/unlink", { childId: child.userId }, c1.token));

    // 子C がログインし直して、別の保護者C2 と QR で連携する
    const again = await newPerson("c-f2");
    expect(again.userId).toBe(child.userId);
    const c2 = await newPerson("p2-f2");
    await link(again.token, c2.token);

    const after = await parentView(child.userId, c2.token);
    expect(after.usage.days).toHaveLength(1);
    expect(after.usage.days[0]).toMatchObject({ recorded: false, usedMinutes: null, apps: [] });
    expect(after.usage.lastUploadedAt).toBeNull();
    expect(after.tests.testPeriods).toEqual([]);
    expect(after.blanks.blankPeriods).toEqual([]);
    expect(after.plan.plan).toBeNull();
    expect(after.plan.usualLimitMinutes).toBeNull();
    expect(after.excluded.apps).toEqual([]);
    expect(after.excluded.removedApps).toEqual([]);
    expect(after.sites.sites).toEqual([]);
    expect(after.apps).toEqual({ childId: child.userId, apps: [], receivedAt: null });
    expect(after.icons.icons).toEqual([]);
    expect(after.device.status).toBeNull();
    // 本文のどこにも前の家庭の名前が出ない
    const text = JSON.stringify(after);
    for (const old of [oldApp.label, oldApp.packageName, "旧保護者", "old-family.example.com"])
      expect(text).not.toContain(old);

    // 設定の版は 0 に戻らず、前より大きい（端末が持っている前の版より新しいと分かる）
    expect(after.plan.configVersion).toBeGreaterThan(before.plan.configVersion);

    // 子どもが読む設定（C7）にも前のテスト期間・空白期間・対象外アプリ・サイトが入らない
    const config = await ok(post("/api/config/get", { childId: child.userId }, again.token));
    for (const old of [oldApp.packageName, "旧保護者", "old-family.example.com"])
      expect(JSON.stringify(config)).not.toContain(old);
  });

  it("C2 は前の家庭のデータを書き換えずに、最初から設定を作れる", async () => {
    const { child, parent: c1 } = await newFamily("f2b");
    await fillOldFamily(child.userId, child.token, c1.token);
    await ok(post("/api/family/unlink", { childId: child.userId }, c1.token));
    const again = await newPerson("c-f2b");
    const c2 = await newPerson("p2-f2b");
    await link(again.token, c2.token);

    const v = await versionOf(child.userId, c2.token);
    await ok(
      post(
        "/api/test-period/create",
        {
          childId: child.userId,
          expectedVersion: v,
          name: "新しいテスト",
          startDate: "2026-11-10",
          endDate: "2026-11-11",
        },
        c2.token,
      ),
    );
    const list = api.testPeriodList.res.parse(
      await ok(post("/api/test-period/list", { childId: child.userId }, c2.token)),
    );
    expect(list.testPeriods.map((t) => t.name)).toEqual(["新しいテスト"]);
  });

  it("ほかの家庭の子どものデータは消えない", async () => {
    const a = await newFamily("f2c");
    const b = await newFamily("f2d");
    await fillOldFamily(b.child.userId, b.child.token, b.parent.token);
    await ok(post("/api/family/unlink", { childId: a.child.userId }, a.parent.token));
    const view = await parentView(b.child.userId, b.parent.token);
    expect(view.tests.testPeriods).toHaveLength(1);
    expect(view.usage.days[0]?.apps).toHaveLength(1);
    expect(view.apps.apps).toHaveLength(1);
  });
});

describe("V: 連携を外した記録（F-7 / IPA-15）", () => {
  const auditOf = async (childId: string) =>
    (await db()).select().from(auditEvents).where(eq(auditEvents.childId, childId));

  it("外すと、誰が（保護者）・いつ・どの子どもを外したかが1行残る", async () => {
    const { child, parent } = await newFamily("f7");
    await ok(post("/api/family/unlink", { childId: child.userId }, parent.token));
    const rows = await auditOf(child.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "family_unlink", actorUserId: parent.userId, childId: child.userId });
    expect(rows[0]?.createdAt.toISOString()).toBe("2026-10-15T03:00:00.000Z");
  });

  it("外せなかったとき（子ども自身・ほかの家庭の保護者で 403）は残らない", async () => {
    const a = await newFamily("f7a");
    const b = await newFamily("f7b");
    expect((await post("/api/family/unlink", { childId: a.child.userId }, a.child.token)).status).toBe(403);
    expect((await post("/api/family/unlink", { childId: b.child.userId }, a.parent.token)).status).toBe(403);
    expect(await auditOf(a.child.userId)).toEqual([]);
    expect(await auditOf(b.child.userId)).toEqual([]);
  });
});
