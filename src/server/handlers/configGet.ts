// C7: 日程・日別上限・対象外アプリ・版を1組で返す（knownVersion と同じ版なら中身を省く）。
import { callerOf, handle } from "../route.js";
import { getConfigForCaller } from "../services/config-snapshot.js";

export default handle("configGet", async (req, ctx) =>
  getConfigForCaller(callerOf(ctx), req.childId, req.knownVersion),
);
