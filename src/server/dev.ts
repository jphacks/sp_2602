// 手元用のサーバ（lead の担当）。npm run dev:server で http://localhost:3000 に立つ。
// 実機やエミュレータから届くよう、同じネットワークの全アドレスで待つ（Android エミュレータからは http://10.0.2.2:3000）。
// MOCK=1 のときは、store の中身（ログイン・紐づけ・計画・日程・利用記録）を state/mock-store.json に残し、
// 立て直したときに読み込む（src/server/mock/persist.ts）。残したくないときは MOCK_PERSIST=0、置き場所は MOCK_STORE_FILE で変える。
import { serve } from "@hono/node-server";
import app from "./app.js";
import { isMock } from "./env.js";
import { DEFAULT_MOCK_STORE_FILE, enableMockPersistence } from "./mock/persist.js";

const persistence =
  isMock() && process.env.MOCK_PERSIST !== "0"
    ? enableMockPersistence(process.env.MOCK_STORE_FILE?.trim() || DEFAULT_MOCK_STORE_FILE)
    : null;

const port = Number(process.env.PORT ?? 3000);
serve(
  {
    fetch: async (request, env) => {
      const res = await app.fetch(request, env);
      // 読むだけの呼び出しでも、合言葉の期限の延長・子どもの端末が使っている版（Q6）が変わるので、毎回書き出しを予約する
      persistence?.scheduleSave();
      return res;
    },
    port,
    hostname: "0.0.0.0",
  },
  (info) => {
    console.log(`サーバが立ちました: http://localhost:${info.port}（MOCK=${isMock() ? "1" : "なし"}）`);
    if (persistence) console.log(`データの置き場所: ${persistence.file}（消すと見本だけに戻ります）`);
  },
);
