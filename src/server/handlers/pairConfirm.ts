// C1: 子どもの「はい / いいえ」。はいなら D2 に保存してから linked を返す。
import { confirmPair } from "../auth";
import { callerOf, handle } from "../route";

export default handle("pairConfirm", async (req, ctx) => confirmPair(callerOf(ctx), req.pairId, req.accept));
