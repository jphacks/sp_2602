// npm run db:push [-- --force] — src/server/db/schema.ts の形を DATABASE_URL の DB（Neon）にそのまま反映する（マイグレーションは作らない）。
// DATABASE_URL は .env.local（vercel env pull .env.local で取れる）か .env から読む。手元の PGlite は起動時に自動で作るので不要。
// 列を消す・型を変えるなど、データが消える変更は確認を求められる。ハッカソン中は --force でそのまま進めてよい（DB は作り直す前提）。
import { spawnSync } from "node:child_process";
import { p } from "./lib/kit.mjs";

if (!process.env.DATABASE_URL) {
  console.error(
    "✗ DATABASE_URL がない。Vercel の Neon につなぐなら: vercel env pull .env.local（手元の開発・テストは不要。PGlite が自動で動く）",
  );
  process.exit(1);
}
const r = spawnSync("npx", ["drizzle-kit", "push", ...process.argv.slice(2)], {
  cwd: p("."),
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(r.status ?? 1);
