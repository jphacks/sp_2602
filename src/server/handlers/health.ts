// 生きているかの確認。mock は MOCK=1 で動いているか（画面の開発用の表示に使える）。

import { db, isDatabaseHealthy } from "../db/index.js";
import { isMock } from "../env.js";
import { handle } from "../route.js";

export default handle("health", async () => {
  const healthy = await isDatabaseHealthy(await db());
  if (!healthy) throw new Error("Database health check failed.");
  return { ok: true as const, mock: isMock() };
});
