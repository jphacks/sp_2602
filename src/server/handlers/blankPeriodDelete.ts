// 空白期間（Q7）を消す。保護者だけ。削除とC10再計算をDB transactionで行う。
import { callerOf, handle } from "../route.js";
import { deleteBlankPeriodForParent } from "../services/blank-periods.js";

export default handle("blankPeriodDelete", async (input, ctx) => deleteBlankPeriodForParent(callerOf(ctx), input));
