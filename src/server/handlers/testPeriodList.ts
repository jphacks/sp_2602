// D3: テスト期間の一覧（開始日の早い順）。
import { callerOf, handle } from "../route";
import { listTestPeriodsForCaller } from "../services/test-periods";

export default handle("testPeriodList", async (req, ctx) => listTestPeriodsForCaller(callerOf(ctx), req.childId));
