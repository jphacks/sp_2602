// D3: テスト期間の一覧（開始日の早い順）。
import { getStore } from "../mock/store";
import { handle } from "../route";

export default handle("testPeriodList", async (req) => getStore().testPeriods(req.childId));
