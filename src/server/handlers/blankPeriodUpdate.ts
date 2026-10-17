// 空白期間（Q7）を変える。保護者だけ。更新とC10再計算をDB transactionで行う。
import { callerOf, handle } from "../route";
import { updateBlankPeriodForParent } from "../services/blank-periods";

export default handle("blankPeriodUpdate", async (input, ctx) => updateBlankPeriodForParent(callerOf(ctx), input));
