// D3: テスト期間を変える（親子）。更新とC10再計算をDB transactionで行う。
import { callerOf, handle } from "../route.js";
import { updateTestPeriodForCaller } from "../services/test-periods.js";

export default handle("testPeriodUpdate", async (input, ctx) => updateTestPeriodForCaller(callerOf(ctx), input));
