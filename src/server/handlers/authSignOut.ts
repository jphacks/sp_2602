// C1: ログアウト。サーバ側で合言葉を使えなくする（otherDevices: true なら、この端末以外の合言葉をすべて）。
import { getStore } from "../mock/store";
import { callerOf, handle } from "../route";

export default handle("authSignOut", async (req, ctx) => getStore().signOut(callerOf(ctx), req.otherDevices ?? false));
