// D3: テスト期間を足す（親子。作った人を残す。Q11）。保存と同時に C10 で今日から先の日別上限を作り直す。
import { getStore } from "../mock/store";
import { callerOf, handle } from "../route";

export default handle("testPeriodCreate", async ({ childId, expectedVersion, ...period }, ctx) =>
  getStore().testPeriodCreate(callerOf(ctx), childId, expectedVersion, period),
);
