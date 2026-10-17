// Q15: 子どもが自分の端末のアプリのアイコン（PNG・50 枚ずつ）を送る。サーバが中身（PNG・大きさ・ハッシュ）を確かめる。
// 保護者は契約の auth: child で forbidden。今の一覧にないアプリのアイコンは保存しない。
import { callerOf, handle } from "../route.js";
import { uploadChildAppIconsForChild } from "../services/child-apps.js";

export default handle("childAppIconsUpload", async (req, ctx) => uploadChildAppIconsForChild(callerOf(ctx), req.icons));
