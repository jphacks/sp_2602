// D8: 計画を見る（親子。子どもは閲覧のみ）。childId を扱えるかは route.ts が確かめ済み。
import { callerOf, handle } from "../route";
import { getPlanForCaller } from "../services/plan-settings";

export default handle("planGet", async (req, ctx) => getPlanForCaller(callerOf(ctx), req.childId));
