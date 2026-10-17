// C9: 対象外アプリの一覧と、子どもの端末のアプリ一覧（親子。子どもは閲覧のみ）。
import { getStore } from "../mock/store";
import { handle } from "../route";

export default handle("excludedAppsGet", async (req) => getStore().excludedAppsView(req.childId));
