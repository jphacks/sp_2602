// C1: 子どもが QR を出す（使い捨ての番号を作る）。保護者は conflict。
// 1人1分に5回まで（1回ごとに DB へ行を書くため。src/server/rate-limit.ts の PAIR_START_LIMIT。セキュリティ検査 F-5）
import { startPair } from "../auth.js";
import { countCall, PAIR_START_LIMIT } from "../rate-limit.js";
import { callerOf, handle } from "../route.js";

export default handle("pairStart", async (req, ctx) => {
  const caller = callerOf(ctx);
  await countCall(PAIR_START_LIMIT, caller.userId);
  return startPair(caller, req.name);
});
