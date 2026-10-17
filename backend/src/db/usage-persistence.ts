import { eq } from "drizzle-orm";
import type { Database } from "./index.js";
import { usageRecords, usageSyncBatches } from "./schema/usage.js";

export interface UsageRecordInput {
  usageDate: string;
  appId: string;
  usedMinutes: number;
}

export interface PersistUsageSubmissionInput {
  submissionId: string;
  childId: string;
  records: readonly UsageRecordInput[];
}

export type PersistUsageSubmissionResult =
  | { status: "stored"; submissionId: string; recordCount: number }
  | { status: "duplicate"; submissionId: string; recordCount: number };

export class UsageSubmissionConflictError extends Error {
  readonly code = "usage_submission_conflict";

  constructor(submissionId: string) {
    super(`Usage submission ${submissionId} conflicts with an existing submission.`);
    this.name = "UsageSubmissionConflictError";
  }
}

function sameRecords(
  stored: readonly UsageRecordInput[],
  incoming: readonly UsageRecordInput[],
): boolean {
  if (stored.length !== incoming.length) return false;

  const compare = (a: UsageRecordInput, b: UsageRecordInput): number => {
    if (a.usageDate !== b.usageDate) return a.usageDate < b.usageDate ? -1 : 1;
    if (a.appId !== b.appId) return a.appId < b.appId ? -1 : 1;
    return a.usedMinutes - b.usedMinutes;
  };
  const orderedStored = [...stored].sort(compare);
  const orderedIncoming = [...incoming].sort(compare);

  return orderedStored.every((record, index) => {
    const candidate = orderedIncoming[index];
    return candidate !== undefined
      && record.usageDate === candidate.usageDate
      && record.appId === candidate.appId
      && record.usedMinutes === candidate.usedMinutes;
  });
}

/** Persist one immutable C8 snapshot. The batch and its records commit or roll back together. */
export async function persistUsageSubmission(
  db: Database,
  input: PersistUsageSubmissionInput,
): Promise<PersistUsageSubmissionResult> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(usageSyncBatches)
      .values({
        submissionId: input.submissionId,
        childId: input.childId,
      })
      .onConflictDoNothing({ target: usageSyncBatches.submissionId })
      .returning({ submissionId: usageSyncBatches.submissionId });

    if (inserted.length === 0) {
      const [existing] = await tx
        .select({ childId: usageSyncBatches.childId })
        .from(usageSyncBatches)
        .where(eq(usageSyncBatches.submissionId, input.submissionId))
        .limit(1);

      if (!existing || existing.childId !== input.childId) {
        throw new UsageSubmissionConflictError(input.submissionId);
      }

      const storedRecords = await tx
        .select({ usageDate: usageRecords.usageDate, appId: usageRecords.appId, usedMinutes: usageRecords.usedMinutes })
        .from(usageRecords)
        .where(eq(usageRecords.submissionId, input.submissionId));
      if (!sameRecords(storedRecords, input.records)) {
        throw new UsageSubmissionConflictError(input.submissionId);
      }

      return { status: "duplicate", submissionId: input.submissionId, recordCount: storedRecords.length };
    }

    if (input.records.length > 0) {
      await tx.insert(usageRecords).values(input.records.map((record) => ({
        submissionId: input.submissionId,
        childId: input.childId,
        usageDate: record.usageDate,
        appId: record.appId,
        usedMinutes: record.usedMinutes,
      })));
    }

    return { status: "stored", submissionId: input.submissionId, recordCount: input.records.length };
  });
}
