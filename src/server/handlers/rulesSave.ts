// 例（kit:reset で消える）: 保護者が決めた制限ルールを保存する。
// TODO: 本物では「呼んだのが保護者か」をここで検証する（子どもの端末からは変更できない。docs/rules/stack.md「保護者の権限」）
import { isMock } from "../env";
import { handle } from "../route";
import { saveRules } from "../rules";

export default handle("rulesSave", async (req) => {
  if (isMock()) return { ...req, updatedAt: new Date().toISOString() };
  return saveRules(req.childId, req.limits);
});
