// 保護者の、連携済みの子どもの一覧。
import { readFamily } from "../auth.js";
import { callerOf, handle } from "../route.js";

export default handle("familyGet", async (_req, ctx) => readFamily(callerOf(ctx)));
