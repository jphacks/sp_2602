// 空白期間（Q7）の一覧。保護者だけ（子どもは configGet の blankPeriods で見る）。
import { getStore } from "../mock/store";
import { handle } from "../route";

export default handle("blankPeriodList", async (req) => getStore().blankPeriods(req.childId));
