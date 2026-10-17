// 保護者が制限する Web サイトを保存する（子どもは契約の auth: parent で forbidden。D-111）。
import { callerOf, handle } from "../route.js";
import { saveBlockedSitesForParent } from "../services/blocked-sites.js";

export default handle("blockedSitesSave", async (req, ctx) => saveBlockedSitesForParent(callerOf(ctx), req));
