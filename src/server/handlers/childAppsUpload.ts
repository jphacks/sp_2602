// Q15: 子どもが自分の端末のアプリ一覧（packageName と表示名だけ）を送る。全件の置き換え（保護者は契約の auth: child で forbidden）。
import { callerOf, handle } from "../route.js";
import { uploadChildAppsForChild } from "../services/child-apps.js";

export default handle("childAppsUpload", async (req, ctx) => uploadChildAppsForChild(callerOf(ctx), req.apps));
