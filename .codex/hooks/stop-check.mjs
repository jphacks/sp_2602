// Codex 用: 未コミットの変更があるのに型チェックが通らないまま終わろうとしたら、続けさせる（.claude/hooks/stop-check.mjs と同じ判定）。
// 続けさせるときは stdout に JSON（decision: "block"）を返す。reason が次の指示として Codex に渡る。
// 終了コード 2 は Windows の Codex 0.162 では hook のエラー扱いになり効かない。
// 2回目（stop_hook_active）は通す。無限ループを避けるため。
import { sh } from "../../scripts/lib/kit.mjs";

let input = "";
for await (const chunk of process.stdin) input += chunk;
if (JSON.parse(input.trim() || "{}").stop_hook_active) process.exit(0);

const changed = sh("git status --porcelain -- src contracts tests", { allowFail: true });
if (!changed) process.exit(0);

if (sh("npm run -s typecheck", { allowFail: true }) === null) {
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason:
        "型チェックが通っていません。`npm run typecheck` の結果を直してから終えてください。直せない場合は理由を報告してください。",
    }),
  );
}
process.exit(0);
