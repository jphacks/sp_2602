// 保護者が、子どもの一番新しい使用状況を見る。
import { fixtures } from "../../../contracts/fixtures";
import { isMock } from "../env";
import { handle } from "../route";
import { getLatestUsage } from "../usage";

export default handle("usageGet", async (req) => {
  if (isMock()) return { ...fixtures.usageGet, childId: req.childId };
  return getLatestUsage(req.childId);
});
