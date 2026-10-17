// 手元用のサーバ（lead の担当）。npm run dev:server で http://localhost:3000 に立つ。
// 実機やエミュレータから届くよう、同じネットワークの全アドレスで待つ（Android エミュレータからは http://10.0.2.2:3000）。
import { serve } from "@hono/node-server";
import app from "./app.js";
import { isMock } from "./env.js";

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`サーバが立ちました: http://localhost:${info.port}（MOCK=${isMock() ? "1" : "なし"}）`);
});
