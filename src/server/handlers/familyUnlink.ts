// 保護者が子どもとの連携を外す。子どもの合言葉もすべて使えなくなる（子どもの端末をなくしたときにも使う）。
import { getStore } from "../mock/store";
import { callerOf, handle } from "../route";

export default handle("familyUnlink", async (req, ctx) => getStore().unlinkChild(callerOf(ctx), req.childId));
