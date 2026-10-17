// C8: preserve each device snapshot and its idempotency key in PostgreSQL.
import { persistUsageSubmission, UsageSubmissionConflictError } from "../../../backend/src/db/usage-persistence.js";
import { db } from "../db/index.js";
import { isMock } from "../env.js";
import { AppError } from "../errors.js";
import { getStore } from "../mock/store.js";
import { handle } from "../route.js";

export default handle("usageUpload", async (req) => {
  if (isMock()) return getStore().usageUpload(req.childId, req.submissionId, req.days);
  if (new Set(req.days.map((day) => day.date)).size !== req.days.length) {
    throw new AppError("bad_request", "同じ送信内に同じ日付の記録が複数あります。この形式の扱いは未確定です");
  }
  try {
    const result = await persistUsageSubmission(await db(), {
      submissionId: req.submissionId,
      childId: req.childId,
      days: req.days,
    });
    return {
      submissionId: req.submissionId,
      status: result.status === "stored" ? "accepted" : "duplicate",
      appliedDates: result.appliedDates,
    };
  } catch (error) {
    if (error instanceof UsageSubmissionConflictError) {
      throw new AppError(
        "conflict",
        "同じ送信 ID で、違う内容の記録が届きました",
        "この記録は送り直さずに、新しい送信 ID で送ってください",
      );
    }
    throw error;
  }
});
