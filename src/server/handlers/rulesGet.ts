// 例（kit:reset で消える）: 子どもの制限ルールを返す。
import { fixtures } from "../../../contracts/fixtures";
import { isMock } from "../env";
import { handle } from "../route";
import { getRules } from "../rules";

export default handle("rulesGet", async (req) => {
  if (isMock()) return { ...fixtures.rulesGet, childId: req.childId };
  return getRules(req.childId);
});
