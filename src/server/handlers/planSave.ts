// D8: 保護者が計画（開始日・S・G。通常上限も一緒に変えられる）を保存する。保存と設定版更新をDB transactionで行う。C10計算結果は返さない。
import { callerOf, handle } from "../route.js";
import { savePlanForCaller } from "../services/plan-settings.js";

export default handle("planSave", async (req, ctx) => savePlanForCaller(callerOf(ctx), req));
