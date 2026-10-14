import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // npm run doctor が開発中のサーバとぶつからないよう、出力先を切り替えられるようにしておく
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // 手元用の DB（PGlite の wasm）と、テーブルを作る drizzle-kit はまとめずに node_modules から読む（src/server/db/index.ts）
  serverExternalPackages: ["@electric-sql/pglite", "drizzle-kit"],
};

export default config;
