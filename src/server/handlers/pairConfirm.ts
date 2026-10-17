// C1: 子どもの「はい / いいえ」。はいなら D2 に保存してから linked を返す。
import { getStore } from "../mock/store";
import { callerOf, handle } from "../route";

export default handle("pairConfirm", async (req, ctx) => getStore().pairConfirm(callerOf(ctx), req.pairId, req.accept));
