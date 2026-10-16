// 生きているかの確認（lead の担当）。

import { isMock } from "../env";
import { handle } from "../route";

export default handle("health", async () => ({ ok: true as const, mock: isMock() }));
