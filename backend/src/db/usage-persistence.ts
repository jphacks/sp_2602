import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { UsageDayReport } from "../../../contracts/schemas.js";
import type { Database } from "./index.js";
import { usageDayReports, usageRecords, usageSyncBatches } from "./schema/usage.js";
import { users } from "./schema/users.js";

export type UsageSubmissionStatus = "stored" | "duplicate";
export interface PersistUsageSubmissionResult {
  status: UsageSubmissionStatus;
  submissionId: string;
  appliedDates: string[];
}

export class UsageSubmissionConflictError extends Error {
  readonly code = "usage_submission_conflict";

  constructor(submissionId: string) {
    super(`Usage submission ${submissionId} conflicts with an existing submission.`);
    this.name = "UsageSubmissionConflictError";
  }
}

const canonicalPayload = (days: readonly UsageDayReport[]) => JSON.stringify(
  [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      date: day.date,
      measuredAt: new Date(day.measuredAt).toISOString(),
      restrictedMinutes: day.restrictedMinutes,
      apps: [...day.apps]
        .sort((a, b) => a.packageName.localeCompare(b.packageName))
        .map((app) => ({
          packageName: app.packageName,
          label: app.label,
          usedMinutes: app.usedMinutes,
          excluded: app.excluded,
        })),
    })),
);

const hashPayload = (days: readonly UsageDayReport[]) =>
  createHash("sha256").update(canonicalPayload(days)).digest("hex");

/**
 * Store a C8 submission and determine which date snapshots it supersedes.
 * Only the newest measurement per child and date is kept (C8 / Q8: "the newer measurement wins"): an applied date
 * replaces the older day report and app rows of that date, and a date that is not applied (older or equal measuredAt)
 * is not stored at all. The submission row itself (usage_sync_batches) is kept so that a retry with the same
 * submission ID is still answered as duplicate / conflict.
 * Why: previously every submission inserted all of its rows, including dates that were not applied, and nothing was
 * ever deleted. Changing the submission ID let one child write up to 7 days x 1000 apps per request without limit
 * (security self-check 🟠4). The accepted date range is checked by the API handler (src/server/handlers/usageUpload.ts).
 */
export async function persistUsageSubmission(
  db: Database,
  input: { submissionId: string; childId: string; days: readonly UsageDayReport[] },
): Promise<PersistUsageSubmissionResult> {
  const payloadHash = hashPayload(input.days);
  // A measuredAt later than the server clock is stored as the server clock. Otherwise a report from a device whose
  // clock ran ahead stays "newest" for that date, and later correct reports are rejected as older (the parent's view
  // stops updating). The payload hash keeps the original values so an identical retry is still a duplicate.
  const nowMs = Date.now();
  const days = input.days.map((day) =>
    Date.parse(day.measuredAt) > nowMs ? { ...day, measuredAt: new Date(nowMs).toISOString() } : day);

  return db.transaction(async (tx) => {
    // Serialize submissions for one child so appliedDates reflects the latest committed snapshot.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, input.childId)).for("update");
    const [existing] = await tx
      .select({ childId: usageSyncBatches.childId, payloadHash: usageSyncBatches.payloadHash, appliedDates: usageSyncBatches.appliedDates })
      .from(usageSyncBatches)
      .where(eq(usageSyncBatches.submissionId, input.submissionId))
      .limit(1);

    if (existing) {
      if (existing.childId !== input.childId || existing.payloadHash !== payloadHash) {
        throw new UsageSubmissionConflictError(input.submissionId);
      }
      return { status: "duplicate", submissionId: input.submissionId, appliedDates: existing.appliedDates };
    }

    const candidates = days.map((day) => day.date);
    const current = candidates.length === 0 ? [] : await tx
      .select({ usageDate: usageDayReports.usageDate, measuredAt: usageDayReports.measuredAt })
      .from(usageDayReports)
      .where(and(
        eq(usageDayReports.childId, input.childId),
        inArray(usageDayReports.usageDate, candidates),
      ));
    const newestByDate = new Map<string, number>();
    for (const row of current) {
      const ms = row.measuredAt.getTime();
      newestByDate.set(row.usageDate, Math.max(newestByDate.get(row.usageDate) ?? Number.NEGATIVE_INFINITY, ms));
    }
    // Equal measuredAt timestamps retain the already accepted report, matching the C8 "strictly newer" rule.
    const appliedDays = days.filter((day) => {
      const currentMs = newestByDate.get(day.date);
      return currentMs === undefined || Date.parse(day.measuredAt) > currentMs;
    });
    const appliedDates = appliedDays.map((day) => day.date).sort();

    const inserted = await tx
      .insert(usageSyncBatches)
      .values({
        submissionId: input.submissionId,
        childId: input.childId,
        payloadHash,
        appliedDates,
      })
      .onConflictDoNothing({ target: usageSyncBatches.submissionId })
      .returning({ submissionId: usageSyncBatches.submissionId });
    if (inserted.length === 0) {
      const [raced] = await tx
        .select({ childId: usageSyncBatches.childId, payloadHash: usageSyncBatches.payloadHash, appliedDates: usageSyncBatches.appliedDates })
        .from(usageSyncBatches)
        .where(eq(usageSyncBatches.submissionId, input.submissionId))
        .limit(1);
      if (!raced || raced.childId !== input.childId || raced.payloadHash !== payloadHash) {
        throw new UsageSubmissionConflictError(input.submissionId);
      }
      return { status: "duplicate", submissionId: input.submissionId, appliedDates: raced.appliedDates };
    }

    if (appliedDays.length > 0) {
      // Replace the older snapshot of each applied date (app rows first: they reference the day report).
      await tx.delete(usageRecords).where(and(
        eq(usageRecords.childId, input.childId),
        inArray(usageRecords.usageDate, appliedDates),
      ));
      await tx.delete(usageDayReports).where(and(
        eq(usageDayReports.childId, input.childId),
        inArray(usageDayReports.usageDate, appliedDates),
      ));

      await tx.insert(usageDayReports).values(appliedDays.map((day) => ({
        submissionId: input.submissionId,
        childId: input.childId,
        usageDate: day.date,
        measuredAt: new Date(day.measuredAt),
        restrictedMinutes: day.restrictedMinutes,
      })));

      const appRows = appliedDays.flatMap((day) => day.apps.map((app) => ({
        submissionId: input.submissionId,
        childId: input.childId,
        usageDate: day.date,
        appId: app.packageName,
        label: app.label,
        usedMinutes: app.usedMinutes,
        excluded: app.excluded,
      })));
      if (appRows.length > 0) await tx.insert(usageRecords).values(appRows);
    }

    return { status: "stored", submissionId: input.submissionId, appliedDates };
  });
}
