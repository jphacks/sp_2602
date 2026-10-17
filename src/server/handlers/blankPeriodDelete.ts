// 空白期間（Q7）を消す。保護者だけ。保存と同時に C10 で日別上限を作り直す（その日から元の上限に戻る）。
import { getStore } from "../mock/store";
import { handle } from "../route";

export default handle("blankPeriodDelete", async (req) =>
  getStore().blankPeriodDelete(req.childId, req.expectedVersion, req.id),
);
