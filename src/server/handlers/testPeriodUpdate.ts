// D3: テスト期間を変える（親子）。保存と同時に C10 で日別上限を作り直す。
import { getStore } from "../mock/store";
import { handle } from "../route";

export default handle("testPeriodUpdate", async ({ childId, expectedVersion, ...period }) =>
  getStore().testPeriodUpdate(childId, expectedVersion, period),
);
