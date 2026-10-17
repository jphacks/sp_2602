// Vercel の入口（lead の担当）。Vercel は最上位の server.ts（または index.ts・app.ts）の default export の Hono をそのまま公開する。
// 実処理は src/server/app.ts。Honoの入口としてVercelに認識させるため、このファイルで型実体も確認する。
import { Hono } from "hono";
import app from "./src/server/app.js";

if (!(app instanceof Hono)) {
  throw new Error("The Vercel entrypoint must export a Hono app.");
}

export default app;
