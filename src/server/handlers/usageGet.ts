// C6: 保護者が、連携済みの子どもの期間の実績（分）と日別上限を見る（D2 の確認は route.ts が済ませている）。
import { getStore } from "../mock/store";
import { handle } from "../route";

export default handle("usageGet", async (req) => getStore().usageView(req.childId, req.from, req.to));
