import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // npm run doctor が開発中のサーバとぶつからないよう、出力先を切り替えられるようにしておく
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default config;
