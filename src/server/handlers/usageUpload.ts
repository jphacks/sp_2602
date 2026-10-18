// C8: 子どもの端末の利用記録を DB に保存する。日ごとに一番新しい測定だけを残す（backend/src/db/usage-persistence.ts）。
// 受け付ける日付は「今日（日本時間）の USAGE_MAX_PAST_DAYS 日前〜明日」だけ。外れた日が1つでもあれば、送信ごと bad_request
// （端末は直らない失敗として隔離する。D-12）。
// なぜ: 前は日付の形（YYYY-MM-DD）しか見ておらず、0001〜9999 年のどの日でも保存できた（セキュリティ自己点検 🟠4。D-127）。
//   親が一度に見られるのは 190 日（contracts/schemas.ts の UsageQuery）なので、それより古い日は受け取っても使い道がない。
//   明日まで受け付けるのは、日付の変わり目に端末の時計が少し進んでいても、今日の記録を落とさないため

import { persistUsageSubmission, UsageSubmissionConflictError } from "../../../backend/src/db/usage-persistence.js";
import { addDays, todayString } from "../../../contracts/dates.js";
import { db } from "../db/index.js";
import { AppError } from "../errors.js";
import { handle } from "../route.js";

export const USAGE_MAX_PAST_DAYS = 190;

export default handle("usageUpload", async (req) => {
  if (new Set(req.days.map((day) => day.date)).size !== req.days.length) {
    throw new AppError("bad_request", "同じ送信内に同じ日付の記録が複数あります。この形式の扱いは未確定です");
  }
  const today = todayString(new Date());
  const oldest = addDays(today, -USAGE_MAX_PAST_DAYS);
  const latest = addDays(today, 1);
  if (req.days.some((day) => day.date < oldest || day.date > latest)) {
    throw new AppError(
      "bad_request",
      `受け付けられるのは ${oldest} から ${latest} までの日の記録です`,
      "端末の日付と時刻が正しいか確かめてください",
    );
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
