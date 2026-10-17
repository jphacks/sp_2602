// Claude Code 用: 禁止・要確認の git 操作（add -A / --no-verify / force push など）を、実行する前に止める。
// 判定は scripts/lib/guard.mjs（Codex 版 .codex/hooks/guard-bash.mjs と共通）。ask は人間に確認の画面が出る。
import { checkCommand } from "../../scripts/lib/guard.mjs";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const result = checkCommand(JSON.parse(input || "{}").tool_input?.command ?? "");
if (!result) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: result.level,
      permissionDecisionReason: result.reason,
    },
  }),
);
