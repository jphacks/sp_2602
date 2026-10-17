// 共通DBスキーマのマイグレーション設定。Honoとbackendは同じ定義を使う。
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required to generate or run migrations.");

export default defineConfig({
  dialect: "postgresql",
  schema: "./backend/src/db/schema/*.ts",
  out: "./backend/drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
