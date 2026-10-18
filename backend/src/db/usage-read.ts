import { and, desc, eq, gte, lte } from "drizzle-orm";
import { datesInRange } from "../../../contracts/dates.js";
import type { AppMinutes, ParentUsageView, UsageDay } from "../../../contracts/schemas.js";
import type { Database } from "./index.js";
import { dailyLimits, planCalculationVersions } from "./schema/planning.js";
import { childConfigVersions } from "./schema/family.js";
import { usageDayReports, usageRecords, usageSyncBatches } from "./schema/usage.js";

/** Read C6 from immutable C8 day snapshots; no app-minute aggregation is performed. */
export async function readParentUsage(
  database: Database,
  input: { childId: string; from: string; to: string },
): Promise<ParentUsageView> {
  return database.transaction(async (tx) => {
    const reports = await tx
      .select({
        submissionId: usageDayReports.submissionId,
        date: usageDayReports.usageDate,
        measuredAt: usageDayReports.measuredAt,
        usedMinutes: usageDayReports.restrictedMinutes,
      })
      .from(usageDayReports)
      .where(and(
        eq(usageDayReports.childId, input.childId),
        gte(usageDayReports.usageDate, input.from),
        lte(usageDayReports.usageDate, input.to),
      ))
      .orderBy(usageDayReports.usageDate, desc(usageDayReports.measuredAt));

    const latestByDate = new Map<string, (typeof reports)[number]>();
    for (const report of reports) {
      if (!latestByDate.has(report.date)) latestByDate.set(report.date, report);
    }

    const reportIds = [...new Set([...latestByDate.values()].map((report) => report.submissionId))];
    const appRows = reportIds.length === 0 ? [] : await tx
      .select({
        submissionId: usageRecords.submissionId,
        date: usageRecords.usageDate,
        packageName: usageRecords.appId,
        label: usageRecords.label,
        usedMinutes: usageRecords.usedMinutes,
        excluded: usageRecords.excluded,
      })
      .from(usageRecords)
      .where(and(
        eq(usageRecords.childId, input.childId),
        gte(usageRecords.usageDate, input.from),
        lte(usageRecords.usageDate, input.to),
      ));

    const reportsBySubmissionAndDate = new Set(
      [...latestByDate.values()].map((report) => `${report.submissionId}|${report.date}`),
    );
    const appsByDate = new Map<string, AppMinutes[]>();
    for (const app of appRows) {
      if (!reportsBySubmissionAndDate.has(`${app.submissionId}|${app.date}`)) continue;
      // Legacy rows predate labels/exclusion flags. They are omitted from the response rather than guessed.
      if (app.label === null || app.excluded === null) continue;
      const apps = appsByDate.get(app.date) ?? [];
      apps.push({ packageName: app.packageName, label: app.label, usedMinutes: app.usedMinutes, excluded: app.excluded });
      appsByDate.set(app.date, apps);
    }

    const [config] = await tx
      .select({ c10InputVersion: childConfigVersions.c10InputVersion })
      .from(childConfigVersions)
      .where(eq(childConfigVersions.childId, input.childId))
      .limit(1);
    const [currentCalculation] = config
      ? await tx
          .select({ version: planCalculationVersions.version })
          .from(planCalculationVersions)
          .where(and(
            eq(planCalculationVersions.childId, input.childId),
            eq(planCalculationVersions.sourceC10InputVersion, config.c10InputVersion),
          ))
          .orderBy(desc(planCalculationVersions.version))
          .limit(1)
      : [];
    const limitRows = currentCalculation
      ? await tx
          .select({
            date: dailyLimits.limitDate,
            kind: dailyLimits.limitKind,
            limitMinutes: dailyLimits.limitMinutes,
            blankPeriodId: dailyLimits.blankPeriodId,
          })
          .from(dailyLimits)
          .where(and(
            eq(dailyLimits.childId, input.childId),
            eq(dailyLimits.calculationVersion, currentCalculation.version),
            gte(dailyLimits.limitDate, input.from),
            lte(dailyLimits.limitDate, input.to),
          ))
      : [];
    const limits = new Map(limitRows.map((limit) => [limit.date, limit]));

    const days: UsageDay[] = datesInRange(input.from, input.to).map((date) => {
      const report = latestByDate.get(date);
      const apps = (appsByDate.get(date) ?? []).sort((a, b) => b.usedMinutes - a.usedMinutes);
      const limit = limits.get(date);
      return {
        date,
        recorded: report !== undefined,
        usedMinutes: report?.usedMinutes ?? null,
        measuredAt: report?.measuredAt.toISOString() ?? null,
        limit: limit?.kind === "unlimited" && limit.blankPeriodId
          ? { kind: "unlimited", blankPeriodId: limit.blankPeriodId }
          : limit?.limitMinutes !== null && limit?.limitMinutes !== undefined
            ? { kind: "limited", limitMinutes: limit.limitMinutes }
            : null,
        apps,
      };
    });

    const [latestUpload] = await tx
      .select({ receivedAt: usageSyncBatches.receivedAt })
      .from(usageSyncBatches)
      .where(eq(usageSyncBatches.childId, input.childId))
      .orderBy(desc(usageSyncBatches.receivedAt))
      .limit(1);

    return {
      childId: input.childId,
      from: input.from,
      to: input.to,
      days,
      lastUploadedAt: latestUpload?.receivedAt.toISOString() ?? null,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
