// Q15: 保護者が、連携している子どもの端末のアプリ一覧を読む（親16 の候補。子どもは契約の auth: parent で forbidden）。
import { callerOf, handle } from "../route.js";
import { getChildAppsForParent } from "../services/child-apps.js";

export default handle("childAppsGet", async (req, ctx) => getChildAppsForParent(callerOf(ctx), req.childId));
