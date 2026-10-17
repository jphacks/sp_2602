// 制限する Web サイトの一覧（親子。子どもは閲覧のみ。D-111）。
import { callerOf, handle } from "../route.js";
import { getBlockedSitesForCaller } from "../services/blocked-sites.js";

export default handle("blockedSitesGet", async (req, ctx) => getBlockedSitesForCaller(callerOf(ctx), req.childId));
