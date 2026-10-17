// C9: 保護者が対象外アプリを保存する（子どもは契約の auth: parent で forbidden）。
import { getStore } from "../mock/store";
import { handle } from "../route";

export default handle("excludedAppsSave", async (req) =>
  getStore().excludedAppsSave(req.childId, req.expectedVersion, req.apps),
);
