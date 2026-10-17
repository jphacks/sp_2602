import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { childConfigVersions } from "../../backend/src/db/schema/family";
import { dailyLimits, planCalculationVersions } from "../../backend/src/db/schema/planning";
import { usageDayReports, usageRecords, usageSyncBatches } from "../../backend/src/db/schema/usage";
import { users } from "../../backend/src/db/schema/users";
import { persistUsageSubmission, UsageSubmissionConflictError } from "../../backend/src/db/usage-persistence";
import { readParentUsage } from "../../backend/src/db/usage-read";
import { db } from "../../src/server/db";

const report = (measuredAt: string, usedMinutes = 42) => [
  {
    date: "2026-10-16",
    measuredAt,
    restrictedMinutes: usedMinutes,
    apps: [{ packageName: "com.example.video", label: "動画", usedMinutes, excluded: false }],
  },
];

describe("persistent C8/C6 usage", () => {
  it("keeps submission retries idempotent and rejects a changed payload", async () => {
    const database = await db();
    const childId = randomUUID();
    const submissionId = randomUUID();
    await database.insert(users).values({ id: childId, role: "child", displayName: "子ども" });

    try {
      const first = await persistUsageSubmission(database, {
        childId,
        submissionId,
        days: report("2026-10-16T12:00:00.000Z"),
      });
      const retry = await persistUsageSubmission(database, {
        childId,
        submissionId,
        days: report("2026-10-16T12:00:00+00:00"),
      });

      expect(first).toMatchObject({ status: "stored", appliedDates: ["2026-10-16"] });
      expect(retry).toMatchObject({ status: "duplicate", appliedDates: ["2026-10-16"] });
      await expect(
        persistUsageSubmission(database, {
          childId,
          submissionId,
          days: report("2026-10-16T12:00:00.000Z", 43),
        }),
      ).rejects.toBeInstanceOf(UsageSubmissionConflictError);
    } finally {
      await database.delete(usageRecords).where(eq(usageRecords.childId, childId));
      await database.delete(usageDayReports).where(eq(usageDayReports.childId, childId));
      await database.delete(usageSyncBatches).where(eq(usageSyncBatches.childId, childId));
      await database.delete(users).where(eq(users.id, childId));
    }
  });

  it("enforces one row per package per submission and date at the database boundary", async () => {
    const database = await db();
    const childId = randomUUID();
    const submissionId = randomUUID();
    await database.insert(users).values({ id: childId, role: "child", displayName: "子ども" });
    try {
      await database.insert(usageSyncBatches).values({ submissionId, childId, payloadHash: "fixture" });
      await database.insert(usageDayReports).values({
        submissionId,
        childId,
        usageDate: "2026-10-16",
        measuredAt: new Date("2026-10-16T12:00:00.000Z"),
        restrictedMinutes: 10,
      });
      const record = {
        submissionId,
        childId,
        usageDate: "2026-10-16",
        appId: "com.example.video",
        label: "動画",
        usedMinutes: 10,
        excluded: false,
      };
      await database.insert(usageRecords).values(record);
      await expect(database.insert(usageRecords).values(record)).rejects.toThrow();
    } finally {
      await database.delete(usageRecords).where(eq(usageRecords.childId, childId));
      await database.delete(usageDayReports).where(eq(usageDayReports.childId, childId));
      await database.delete(usageSyncBatches).where(eq(usageSyncBatches.childId, childId));
      await database.delete(users).where(eq(users.id, childId));
    }
  });

  it("returns the newest measured snapshot per date, preserves missing versus zero, and sorts apps by minutes", async () => {
    const database = await db();
    const childId = randomUUID();
    await database.insert(users).values({ id: childId, role: "child", displayName: "子ども" });
    try {
      await persistUsageSubmission(database, {
        childId,
        submissionId: randomUUID(),
        days: [
          {
            date: "2026-10-16",
            measuredAt: "2026-10-16T12:00:00.000Z",
            restrictedMinutes: 0,
            apps: [
              { packageName: "com.example.low", label: "少", usedMinutes: 2, excluded: false },
              { packageName: "com.example.high", label: "多", usedMinutes: 9, excluded: true },
            ],
          },
        ],
      });
      await persistUsageSubmission(database, {
        childId,
        submissionId: randomUUID(),
        days: report("2026-10-16T11:00:00.000Z", 90),
      });

      const view = await readParentUsage(database, { childId, from: "2026-10-16", to: "2026-10-17" });
      expect(view.days[0]).toMatchObject({
        recorded: true,
        usedMinutes: 0,
        measuredAt: "2026-10-16T12:00:00.000Z",
        apps: [
          { packageName: "com.example.high", usedMinutes: 9, excluded: true },
          { packageName: "com.example.low", usedMinutes: 2, excluded: false },
        ],
      });
      expect(view.days[1]).toMatchObject({ recorded: false, usedMinutes: null, apps: [] });
    } finally {
      await database.delete(usageRecords).where(eq(usageRecords.childId, childId));
      await database.delete(usageDayReports).where(eq(usageDayReports.childId, childId));
      await database.delete(usageSyncBatches).where(eq(usageSyncBatches.childId, childId));
      await database.delete(users).where(eq(users.id, childId));
    }
  });

  it("shows only limits from the latest calculation matching current C10 inputs", async () => {
    const database = await db();
    const childId = randomUUID();
    await database.insert(users).values({ id: childId, role: "child", displayName: "子ども" });
    try {
      await database.insert(childConfigVersions).values({ childId, version: 3, c10InputVersion: 2 });
      await database.insert(planCalculationVersions).values([
        { childId, version: 1, sourceC10InputVersion: 1 },
        { childId, version: 2, sourceC10InputVersion: 2 },
        { childId, version: 3, sourceC10InputVersion: 2 },
      ]);
      await database.insert(dailyLimits).values([
        { childId, calculationVersion: 1, limitDate: "2026-10-16", limitMinutes: 120 },
        { childId, calculationVersion: 2, limitDate: "2026-10-16", limitMinutes: 90 },
        { childId, calculationVersion: 3, limitDate: "2026-10-16", limitMinutes: 80 },
      ]);

      const current = await readParentUsage(database, { childId, from: "2026-10-16", to: "2026-10-16" });
      expect(current.days[0]?.limit).toEqual({ kind: "limited", limitMinutes: 80 });

      await database
        .update(childConfigVersions)
        .set({ c10InputVersion: 3 })
        .where(eq(childConfigVersions.childId, childId));
      const stale = await readParentUsage(database, { childId, from: "2026-10-16", to: "2026-10-16" });
      expect(stale.days[0]?.limit).toBeNull();
    } finally {
      await database.delete(dailyLimits).where(eq(dailyLimits.childId, childId));
      await database.delete(planCalculationVersions).where(eq(planCalculationVersions.childId, childId));
      await database.delete(childConfigVersions).where(eq(childConfigVersions.childId, childId));
      await database.delete(users).where(eq(users.id, childId));
    }
  });
});
