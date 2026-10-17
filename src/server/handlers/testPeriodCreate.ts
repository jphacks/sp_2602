// D3: テスト期間を足す（親子。作った人を残す。Q11）。追加とC10再計算をDB transactionで行う。
import { callerOf, handle } from "../route.js";
import { createTestPeriodForCaller } from "../services/test-periods.js";

export default handle("testPeriodCreate", async ({ childId, expectedVersion, ...period }, ctx) =>
  createTestPeriodForCaller(callerOf(ctx), { childId, expectedVersion, ...period }),
);
