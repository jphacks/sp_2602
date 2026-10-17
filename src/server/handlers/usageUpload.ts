// C8: 子どもの端末が利用記録（今日と昨日の2日分）を送る。同じ送信 ID の送り直しは二重に保存しない。
import { getStore } from "../mock/store";
import { handle } from "../route";

export default handle("usageUpload", async (req) => getStore().usageUpload(req.childId, req.submissionId, req.days));
