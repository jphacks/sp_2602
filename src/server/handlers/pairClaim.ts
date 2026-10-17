// C1: 保護者が読み取った QR の番号を送る（期限切れ・使用済み・二重読取は conflict）。
import { claimPair } from "../auth";
import { callerOf, handle } from "../route";

export default handle("pairClaim", async (req, ctx) => claimPair(callerOf(ctx), req.code));
