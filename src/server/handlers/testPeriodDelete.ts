// D3: テスト期間を消す（親子）。削除とC10再計算をDB transactionで行う。
import { callerOf, handle } from "../route";
import { deleteTestPeriodForCaller } from "../services/test-periods";

export default handle("testPeriodDelete", async (input, ctx) => deleteTestPeriodForCaller(callerOf(ctx), input));
