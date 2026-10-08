// Claude Code 用: 未コミットの変更があるのに型チェックが通らないまま終わろうとしたら、終わらせない。
// 2回目（stop_hook_active）は通す。無限ループを避けるため。
import { sh } from "../../scripts/lib/kit.mjs";

let input = "";
for await (const chunk of process.stdin) input += chunk;
if (JSON.parse(input || "{}").stop_hook_active) process.exit(0);

const changed = sh("git status --porcelain -- src contracts tests", { allowFail: true });
if (!changed) process.exit(0);

if (sh("npm run -s typecheck", { allowFail: true }) === null) {
  console.error(
    "型チェックが通っていません。`npm run typecheck` の結果を直してから終えてください。直せない場合は理由を報告してください。",
  );
  process.exit(2);
}
process.exit(0);
