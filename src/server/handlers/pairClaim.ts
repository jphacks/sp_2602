// C1: 保護者が読み取った QR の番号を送る（期限切れ・使用済み・二重読取は conflict）。
import { getStore } from "../mock/store";
import { callerOf, handle } from "../route";

export default handle("pairClaim", async (req, ctx) => getStore().pairClaim(callerOf(ctx), req.code));
