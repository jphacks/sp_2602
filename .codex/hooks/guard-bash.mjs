// Codex 用: 禁止・要確認の git 操作を、実行する前に止める（.claude/hooks/guard-bash.mjs と同じ判定）。
// Codex の hook は「確認を出す」ができないので、要確認の操作も止めて、人間に確認するよう伝える。
// 止めるときは stdout に JSON を返す（終了コード 2 は Windows の Codex では効かない。docs/kit/codex.md）。
import { checkCommand } from "../../scripts/lib/guard.mjs";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const result = checkCommand(JSON.parse(input.trim() || "{}").tool_input?.command ?? "");
if (!result) process.exit(0);

const reason =
  result.level === "ask"
    ? `${result.reason}（この hook は止めるだけ。人間が承認したなら、人間が自分のターミナルで実行する）`
    : result.reason;
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  }),
);
