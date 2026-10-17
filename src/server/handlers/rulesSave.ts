// 例（kit:reset で消える）: 保護者が決めた制限ルールを保存する。
// 「呼んだのが保護者か」は route.ts が契約の auth: "parent" で確かめ済み（docs/rules/stack.md「保護者の権限」）。
// TODO(back-a): その子どもが、呼んだ保護者の家族かも確かめる（ペアリングの表ができてから。層2）
import { isMock } from "../env";
import { handle } from "../route";
import { saveRules } from "../rules";

export default handle("rulesSave", async (req) => {
  if (isMock()) return { ...req, updatedAt: new Date().toISOString() };
  return saveRules(req.childId, req.limits);
});
