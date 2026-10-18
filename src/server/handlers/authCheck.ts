// 合言葉がまだ使えるかだけを確かめる（D-134）。子どもの端末の Kotlin の監視が約1分ごとに呼ぶ（engine/SessionCheck.kt）。
// DB は読むだけ・中身は返さない・回数の上限には数えない。外された子どもの合言葉なら 401 + reason: family_unlink（D-133）。
import { checkToken } from "../auth.js";
import { handle } from "../route.js";

export default handle("authCheck", async (_req, { request }) => {
  await checkToken(request);
  return { ok: true as const };
});
