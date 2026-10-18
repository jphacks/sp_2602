// D-113: 保護者が、連携している子どもの端末の許可の状態を読む（親01 の注意の帯。子どもは契約の auth: parent で forbidden）。
import { callerOf, handle } from "../route.js";
import { getDeviceStatusForParent } from "../services/device-status.js";

export default handle("deviceStatusGet", async (req, ctx) => getDeviceStatusForParent(callerOf(ctx), req.childId));
