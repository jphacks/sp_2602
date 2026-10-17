// 手元用のサーバ（lead の担当）。npm run dev:server で http://localhost:3000 に立つ。
// 実機やエミュレータから届くよう、同じネットワークの全アドレスで待つ（Android エミュレータからは http://10.0.2.2:3000）。
// DATABASE_URL がなければ手元の DB（PGlite）を state/pglite に残し、立て直したときもログイン・QR の紐づけ・計画・日程・利用記録が残る。
// 残したくないときは MOCK_PERSIST=0（メモリの上だけ）、置き場所は LOCAL_DB_DIR で変える。消したいときは、止めてからフォルダを消す。
import { serve } from "@hono/node-server";
import app from "./app.js";
import { db } from "./db/index.js";
import { isMock } from "./env.js";

const DEFAULT_LOCAL_DB_DIR = "state/pglite";
if (!process.env.DATABASE_URL && process.env.MOCK_PERSIST !== "0")
  process.env.LOCAL_DB_DIR = process.env.LOCAL_DB_DIR?.trim() || DEFAULT_LOCAL_DB_DIR;

const port = Number(process.env.PORT ?? 3000);
// 最初の呼び出しを待たせないよう、立ち上げのときに DB を開いておく（MOCK=1 なら見本もここで入る）
db().then(
  () =>
    serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
      console.log(`サーバが立ちました: http://localhost:${info.port}（MOCK=${isMock() ? "1" : "なし"}）`);
      if (process.env.DATABASE_URL) console.log("データの置き場所: DATABASE_URL の DB");
      else if (process.env.LOCAL_DB_DIR)
        console.log(`データの置き場所: ${process.env.LOCAL_DB_DIR}（消すと見本だけに戻ります）`);
      else console.log("データの置き場所: メモリの上だけ（止めると消えます）");
    }),
  (error) => {
    console.error("DB を開けませんでした。サーバは立てません:", error);
    if (process.env.LOCAL_DB_DIR)
      console.error(
        `手元の DB が壊れているかもしれません。止めてから ${process.env.LOCAL_DB_DIR} を消すと見本から始まります`,
      );
    process.exit(1);
  },
);
