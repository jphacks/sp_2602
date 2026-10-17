// D8: 計画を見る（親子。子どもは閲覧のみ）。childId を扱えるかは route.ts が確かめ済み。
import { getStore } from "../mock/store";
import { handle } from "../route";

export default handle("planGet", async (req) => getStore().planView(req.childId));
