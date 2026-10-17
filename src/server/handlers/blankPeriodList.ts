// 空白期間（Q7）の一覧。保護者だけ（子どもは configGet の blankPeriods で見る）。
import { callerOf, handle } from "../route";
import { listBlankPeriodsForParent } from "../services/blank-periods";

export default handle("blankPeriodList", async (req, ctx) => listBlankPeriodsForParent(callerOf(ctx), req.childId));
