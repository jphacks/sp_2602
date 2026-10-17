// C1: D2 に保存が確定した連携状態（相手の一覧）。
import { readLinkStatus } from "../auth";
import { callerOf, handle } from "../route";

export default handle("linkStatus", async (_req, ctx) => readLinkStatus(callerOf(ctx)));
