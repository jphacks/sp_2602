// 空白期間（Q7）を足す。保護者だけ。期間中は制限なし。保存と同時に C10 で日別上限を作り直す。
import { getStore } from "../mock/store";
import { handle } from "../route";

export default handle("blankPeriodCreate", async ({ childId, expectedVersion, ...period }) =>
  getStore().blankPeriodCreate(childId, expectedVersion, period),
);
