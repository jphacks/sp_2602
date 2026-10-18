// 生きているかの確認。mock は MOCK=1 で動いているか（画面の開発用の表示に使える）。
// DB につながらないときは 503 unavailable（500 にしない。監視・デプロイの確認が「一時的に使えない」と分かるように。セキュリティ検査 AVL-04）。
// DB の接続を開けないとき（db() が失敗）も同じ 503 にする

import { db, isDatabaseHealthy } from "../db/index.js";
import { isMock } from "../env.js";
import { AppError, describeError } from "../errors.js";
import { handle } from "../route.js";

export default handle("health", async () => {
  const database = await db().catch((e: unknown) => {
    console.error("[health] DB を開けません", describeError(e));
    return null;
  });
  if (!database || !(await isDatabaseHealthy(database))) throw new AppError("unavailable");
  return { ok: true as const, mock: isMock() };
});
