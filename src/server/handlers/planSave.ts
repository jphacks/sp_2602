// D8: 保護者が計画（開始日・S・G。通常上限も一緒に変えられる）を保存する。保存と同時に C10 で日別上限を作り直してから返す。
import { getStore } from "../mock/store";
import { handle } from "../route";

export default handle("planSave", async ({ childId, expectedVersion, ...plan }) =>
  getStore().planSave(childId, expectedVersion, plan),
);
