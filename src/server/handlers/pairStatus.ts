// C1: ペアリングの進み具合（自分が関わるものだけ。ほかは not_found）。
import { readPairStatus } from "../auth";
import { callerOf, handle } from "../route";

export default handle("pairStatus", async (req, ctx) => readPairStatus(callerOf(ctx), req.pairId));
