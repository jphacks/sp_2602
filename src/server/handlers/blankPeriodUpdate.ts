// 空白期間（Q7）を変える。保護者だけ。保存と同時に C10 で日別上限を作り直す。
import { getStore } from "../mock/store";
import { handle } from "../route";

export default handle("blankPeriodUpdate", async ({ childId, expectedVersion, ...period }) =>
  getStore().blankPeriodUpdate(childId, expectedVersion, period),
);
