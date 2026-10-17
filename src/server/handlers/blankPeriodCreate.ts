// 空白期間（Q7）を足す。保護者だけ。期間中は制限なし。追加とC10再計算をDB transactionで行う。
import { callerOf, handle } from "../route.js";
import { createBlankPeriodForParent } from "../services/blank-periods.js";

export default handle("blankPeriodCreate", async (input, ctx) => createBlankPeriodForParent(callerOf(ctx), input));
