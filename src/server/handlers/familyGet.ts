// 保護者の、連携済みの子どもの一覧。
import { getStore } from "../mock/store";
import { callerOf, handle } from "../route";

export default handle("familyGet", async (_req, ctx) => getStore().family(callerOf(ctx)));
