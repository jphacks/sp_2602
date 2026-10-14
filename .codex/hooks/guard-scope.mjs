// Codex 用: 自分の所有範囲外のファイルを apply_patch で編集しようとしたら止める（.claude/hooks/guard-scope.mjs と同じ判定）。
// Codex の apply_patch は tool_input.command にパッチの全文が入るので、「*** Update File: <path>」などの行から対象を読む。
// 止めるときは stdout に JSON（permissionDecision: "deny"）を返す。Claude と同じ「終了コード 2」は、
// Windows の Codex 0.162 では hook のエラー扱いになり、パッチがそのまま適用された（実機で確認）。
// シェルのコマンドで書き換えた場合は止められない。そちらは pre-commit と CI が止める（これは早めに気づくための補助）。
import { isAbsolute, relative, resolve } from "node:path";
import { currentMember, loadConfig, ownerOf, ROOT } from "../../scripts/lib/kit.mjs";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const payload = JSON.parse(input.trim() || "{}");
const patch = payload.tool_input?.command;
if (typeof patch !== "string") process.exit(0);

const deny = (reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
    }),
  );
  process.exit(0);
};

// パッチが触るファイル（追加・変更・削除・移動先）。パスは相対なら Codex の作業フォルダ（cwd）から
const base = payload.cwd ?? process.cwd();
const targets = [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$/gm)]
  .map((m) => (isAbsolute(m[1]) ? m[1] : resolve(base, m[1])))
  .map((f) => relative(ROOT, f).replace(/\\/g, "/"))
  .filter((rel) => !rel.startsWith("..") && !isAbsolute(rel)) // リポジトリ外は対象外
  .filter((rel) => !rel.startsWith(".kit/")); // 着手宣言は誰でも書く
if (!targets.length) process.exit(0);

const cfg = loadConfig();
const me = currentMember(cfg);
if (!me) deny("自分が未設定です。人間に `npm run kit:whoami -- <id>` を頼んでください。");
const others = targets
  .map((rel) => ({ rel, owner: ownerOf(rel, cfg) }))
  .filter(({ owner }) => owner !== me.id && owner !== "shared");
if (others.length)
  deny(
    `${others.map(({ rel, owner }) => `${rel} は ${owner ?? "所有者なし"} のファイル`).join("、")}です（自分は ${me.id}）。このパッチは適用していません。編集せず、所有者宛ての Issue を提案してください。契約なら change-request（docs/rules/changes.md）。`,
  );
process.exit(0);
