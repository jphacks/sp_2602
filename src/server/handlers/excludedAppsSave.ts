// C9: 保護者が対象外アプリを保存する（子どもは契約の auth: parent で forbidden）。
import { callerOf, handle } from "../route.js";
import { saveExcludedAppsForParent } from "../services/excluded-apps.js";

export default handle("excludedAppsSave", async (req, ctx) => saveExcludedAppsForParent(callerOf(ctx), req));
