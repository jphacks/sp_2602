// Claude Code 用: 編集したファイルをその場で Biome 整形する（全員のAIの書き方を揃え、差分のノイズを消す）。
import { relative } from "node:path";
import { ROOT, sh } from "../../scripts/lib/kit.mjs";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const file = JSON.parse(input || "{}").tool_input?.file_path;
if (!file || !/\.(ts|tsx|js|mjs|json|css)$/.test(file)) process.exit(0);

const rel = relative(ROOT, file).replace(/\\/g, "/");
if (rel.startsWith("..")) process.exit(0);
sh(`npx biome check --write --no-errors-on-unmatched "${rel}"`, { allowFail: true });
