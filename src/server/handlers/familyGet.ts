// 保護者の、連携済みの子どもの一覧。
import { readFamily } from "../auth";
import { callerOf, handle } from "../route";

export default handle("familyGet", async (_req, ctx) => readFamily(callerOf(ctx)));
