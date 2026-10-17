// D8: 保護者が通常上限を保存する（Q7: 紐づけ直後に決める）。保存と設定版更新をDB transactionで行う。C10計算結果は返さない。
import { callerOf, handle } from "../route.js";
import { saveUsualLimitForCaller } from "../services/plan-settings.js";

export default handle("usualLimitSave", async (req, ctx) => saveUsualLimitForCaller(callerOf(ctx), req));
