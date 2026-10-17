// C1: 子どもが QR を出す（使い捨ての番号を作る）。保護者は conflict。
import { getStore } from "../mock/store";
import { callerOf, handle } from "../route";

export default handle("pairStart", async (req, ctx) => getStore().pairStart(callerOf(ctx), req.name));
