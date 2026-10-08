// Claude Code 用: 自分の所有範囲外のファイルを編集しようとしたら止める。
// （Codex や手作業には pre-commit と CI が効く。これは早めに気づくための補助）
import { relative } from "node:path";
import { currentMember, loadConfig, ownerOf, ROOT } from "../../scripts/lib/kit.mjs";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const file = JSON.parse(input || "{}").tool_input?.file_path;
if (!file) process.exit(0);

const rel = relative(ROOT, file).replace(/\\/g, "/");
if (rel.startsWith("..")) process.exit(0); // リポジトリ外は対象外
if (rel.startsWith(".kit/")) process.exit(0); // 着手宣言は誰でも書く

const cfg = loadConfig();
const me = currentMember(cfg);
if (!me) {
  console.error("自分が未設定です。人間に `npm run kit:whoami -- <id>` を頼んでください。");
  process.exit(2);
}
const owner = ownerOf(rel, cfg);
if (owner === me.id || owner === "shared") process.exit(0);
console.error(
  `${rel} は ${owner ?? "所有者なし"} のファイルです（自分は ${me.id}）。編集せず、所有者宛ての Issue を提案してください。契約なら change-request（docs/rules/changes.md）。`,
);
process.exit(2);
