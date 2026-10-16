// npm run db:push が使う設定（lead の担当）。テーブル定義は src/server/db/schema.ts（back）。
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
