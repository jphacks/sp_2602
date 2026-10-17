// C1: ログアウト。呼んだ合言葉をサーバでも無効にする（store から消す）。以後その合言葉で呼ぶと 401。
// 同じ人がほかの端末でログインしている合言葉は消さない（その端末はログインしたまま）。
import { getStore } from "../mock/store";
import { callerOf, handle } from "../route";

export default handle("authSignOut", async (_req, ctx) => {
  getStore().signOut(callerOf(ctx).token);
  return { ok: true as const };
});
