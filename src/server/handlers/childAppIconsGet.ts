// Q15: 保護者が、連携している子どもの端末のアプリのアイコンを読む（親09・親16。子どもは契約の auth: parent で forbidden）。
import { callerOf, handle } from "../route.js";
import { getChildAppIconsForParent } from "../services/child-apps.js";

export default handle("childAppIconsGet", async (req, ctx) => getChildAppIconsForParent(callerOf(ctx), req));
