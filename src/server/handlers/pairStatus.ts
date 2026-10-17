// C1: ペアリングの進み具合（自分が関わるものだけ。ほかは not_found）。
import { getStore } from "../mock/store";
import { callerOf, handle } from "../route";

export default handle("pairStatus", async (req, ctx) => getStore().pairStatus(callerOf(ctx), req.pairId));
