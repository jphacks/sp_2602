// DB 接続とアプリ共通スキーマの smoke test。DATABASE_URL がなければ PGlite を使う。

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createBlankPeriod } from "../../backend/src/db/blank-periods";
import { InvalidPlanCalculationError, savePlanCalculation } from "../../backend/src/db/plan-calculations";
import { InvalidPlanSettingsError, savePlanSettingsForParent } from "../../backend/src/db/plan-settings";
import { childConfigVersions, familyLinks } from "../../backend/src/db/schema/family";
import { dailyLimits, planCalculationVersions, planSettings, testPeriods } from "../../backend/src/db/schema/planning";
import { blankPeriods } from "../../backend/src/db/schema/settings-state";
import { users } from "../../backend/src/db/schema/users";
import { createTestPeriod, listTestPeriods } from "../../backend/src/db/test-periods";

describe("db", () => {
  it("共通スキーマの users に書いて読み出せる", async () => {
    const d = await db();
    const [row] = await d.insert(users).values({ role: "child", displayName: "DB test" }).returning();
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(row?.role).toBe("child");
    expect(row?.createdAt).toBeInstanceOf(Date);
    const all = await d.select().from(users);
    expect(all.some((user) => user.id === row?.id)).toBe(true);
  });

  it("2回目の db() は同じ接続を返す", async () => {
    expect(await db()).toBe(await db());
  });

  it("rejects C10 limits outside the contract's 0..1440 minute range", async () => {
    await expect(
      savePlanCalculation(await db(), {
        childId: randomUUID(),
        sourceC10InputVersion: 1,
        dailyLimits: [{ limitDate: "2099-01-01", limitMinutes: 1441 }],
      }),
    ).rejects.toBeInstanceOf(InvalidPlanCalculationError);
  });

  it("rejects D8 values outside the contract's 0..1440 minute range", async () => {
    await expect(
      savePlanSettingsForParent(await db(), {
        parentId: randomUUID(),
        childId: randomUUID(),
        planStartDate: "2099-01-01",
        startLimitMinutes: 300,
        finalGoalMinutes: 1441,
      }),
    ).rejects.toBeInstanceOf(InvalidPlanSettingsError);
  });

  it("rejects overlapping D3 and blank periods and rolls back their config revisions", async () => {
    const database = await db();
    const parentId = randomUUID();
    const childId = randomUUID();
    await database.insert(users).values([
      { id: parentId, role: "parent" },
      { id: childId, role: "child" },
    ]);
    await database.insert(familyLinks).values({ parentId, childId });
    try {
      // 版は 0 から（0 = まだ一度も保存していない。contracts の ConfigVersion）
      await savePlanSettingsForParent(database, {
        parentId,
        childId,
        expectedVersion: 0,
        planStartDate: "2099-05-01",
        startLimitMinutes: 240,
        finalGoalMinutes: 60,
      });
      await createTestPeriod(database, {
        actorId: parentId,
        childId,
        expectedVersion: 1,
        name: "first",
        startDate: "2099-05-01",
        endDate: "2099-05-03",
      });
      await expect(
        createTestPeriod(database, {
          actorId: parentId,
          childId,
          expectedVersion: 2,
          name: "second",
          startDate: "2099-05-03",
          endDate: "2099-05-04",
        }),
      ).rejects.toMatchObject({ code: "invalid_c10_inputs" });
      expect(await listTestPeriods(database, parentId, childId)).toHaveLength(1);

      await createBlankPeriod(database, {
        parentId,
        childId,
        expectedVersion: 2,
        name: "first blank",
        startDate: "2099-06-01",
        endDate: "2099-06-03",
      });
      await expect(
        createBlankPeriod(database, {
          parentId,
          childId,
          expectedVersion: 3,
          name: "second blank",
          startDate: "2099-06-03",
          endDate: "2099-06-05",
        }),
      ).rejects.toMatchObject({ code: "invalid_c10_inputs" });
      const savedBlanks = await database.select().from(blankPeriods).where(eq(blankPeriods.childId, childId));
      expect(savedBlanks).toHaveLength(1);
    } finally {
      await database.delete(testPeriods).where(eq(testPeriods.childId, childId));
      await database.delete(blankPeriods).where(eq(blankPeriods.childId, childId));
      await database.delete(dailyLimits).where(eq(dailyLimits.childId, childId));
      await database.delete(planCalculationVersions).where(eq(planCalculationVersions.childId, childId));
      await database.delete(planSettings).where(eq(planSettings.childId, childId));
      await database.delete(childConfigVersions).where(eq(childConfigVersions.childId, childId));
      await database
        .delete(familyLinks)
        .where(and(eq(familyLinks.parentId, parentId), eq(familyLinks.childId, childId)));
      await database.delete(users).where(eq(users.id, parentId));
      await database.delete(users).where(eq(users.id, childId));
    }
  });
});
