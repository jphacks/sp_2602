// D8: 保護者が通常上限を保存する（Q7: 紐づけ直後に決める）。保存と同時に C10 で日別上限を作り直してから返す。
import { getStore } from "../mock/store";
import { handle } from "../route";

export default handle("usualLimitSave", async (req) =>
  getStore().usualLimitSave(req.childId, req.expectedVersion, req.usualLimitMinutes),
);
