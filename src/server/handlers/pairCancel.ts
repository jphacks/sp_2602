// C1: 子どもが「やめる」を押したとき、自分の出した QR（waiting / claimed）を取り消す。以後その code は使えない。
import { cancelPair } from "../auth.js";
import { callerOf, handle } from "../route.js";

export default handle("pairCancel", async (req, ctx) => cancelPair(callerOf(ctx), req.pairId));
