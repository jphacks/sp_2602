// C1: 子どもが「やめる」を押したとき、自分の出した QR（waiting / claimed）を取り消す。以後その code は使えない。
import { getStore } from "../mock/store";
import { callerOf, handle } from "../route";

export default handle("pairCancel", async (req, ctx) => getStore().pairCancel(callerOf(ctx), req.pairId));
