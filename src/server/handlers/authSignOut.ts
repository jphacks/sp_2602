// C1: ログアウト。呼んだ合言葉をサーバでも無効にする（以後その合言葉で呼ぶと 401）。
// 本文なしは、この端末の合言葉だけ（ほかの端末はログインしたまま）。{ otherDevices: true } は、この端末以外の合言葉をすべて。
import { signOut } from "../auth.js";
import { callerOf, handle } from "../route.js";

export default handle("authSignOut", async (req, ctx) => ({
  ok: true as const,
  ...(await signOut(callerOf(ctx), req?.otherDevices ?? false)),
}));
