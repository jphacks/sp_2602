// C9: 対象外アプリの一覧と、子どもの端末のアプリ一覧（親子。子どもは閲覧のみ）。
import { callerOf, handle } from "../route";
import { getExcludedAppsForCaller } from "../services/excluded-apps";

export default handle("excludedAppsGet", async (req, ctx) => getExcludedAppsForCaller(callerOf(ctx), req.childId));
