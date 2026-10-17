// 保護者が子どもとの連携を外す。子どもの合言葉もすべて使えなくなる（子どもの端末をなくしたときにも使う）。
import { unlinkChild } from "../auth.js";
import { callerOf, handle } from "../route.js";

export default handle("familyUnlink", async (req, ctx) => unlinkChild(callerOf(ctx), req.childId));
