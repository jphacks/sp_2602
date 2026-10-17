// C7: 日程・日別上限・対象外アプリ・版を1組で返す（knownVersion と同じ版なら中身を省く）。
import { getStore } from "../mock/store";
import { callerOf, handle } from "../route";

export default handle("configGet", async (req, ctx) =>
  getStore().configGet(callerOf(ctx), req.childId, req.knownVersion),
);
