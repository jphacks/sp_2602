// Vercel の入口（lead の担当）。Vercel は最上位の server.ts（または index.ts・app.ts）の default export の Hono をそのまま公開する。
// 中身は src/server/app.ts。ここには何も足さない。
export { default } from "./src/server/app";
