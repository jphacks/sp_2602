// C1: 子どもが QR を出す（使い捨ての番号を作る）。保護者は conflict。
import { startPair } from "../auth.js";
import { callerOf, handle } from "../route.js";

export default handle("pairStart", async (req, ctx) => startPair(callerOf(ctx), req.name));
