// D-113: 子どもの端末の Kotlin（MonitorService）が許可の状態を送る（保護者は契約の auth: child で forbidden）。
import { callerOf, handle } from "../route.js";
import { reportDeviceStatus } from "../services/device-status.js";

export default handle("deviceStatusReport", async (req, ctx) => reportDeviceStatus(callerOf(ctx), req));
