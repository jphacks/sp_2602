// 子どもの端末が、その日の使用状況を送る。
// TODO: 本物では「呼んだのが子どもの端末か」を検証する（docs/rules/stack.md「保護者の権限」）
import { isMock } from "../env";
import { handle } from "../route";
import { saveUsage } from "../usage";

export default handle("usageReport", async (req) => {
  if (isMock()) return { ...req, updatedAt: new Date().toISOString() };
  return saveUsage(req.childId, req.date, req.apps);
});
