// npm run scope — 変更が自分の所有範囲に収まっているか、契約変更に CHANGELOG があるかを検査する。
//   --staged          : コミット予定の変更（pre-commit で使う）
//   --base <ref>      : <ref> との差分（CI で使う）
//   --member <id>     : 検査する人（省略時は .kit-member / KIT_MEMBER）
//   --author <login>  : GitHub ログインから人を引く（CI 用）
//   --branch <name>   : 同じログインを複数人で使うとき、ブランチ名の先頭 <id>/ で人を決める（CI 用）
import { currentMember, loadConfig, ownerOf, sh } from "./lib/kit.mjs";

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const cfg = loadConfig();

// 初回コミット（キット一式を入れる時）は全員分のファイルを含むので、範囲チェックをしない
if (sh("git rev-parse --verify -q HEAD", { allowFail: true }) === null) {
  console.log("初回コミット前のため範囲チェックを省略");
  process.exit(0);
}

let me = null;
if (opt("--member")) me = cfg.members.find((m) => m.id === opt("--member"));
else if (opt("--author")) {
  // 同じ GitHub アカウントを複数人で使う場合（リハーサル等）は、ブランチ名の先頭 <id>/ で人を決める
  const byLogin = cfg.members.filter((m) => m.github.toLowerCase() === opt("--author").toLowerCase());
  const prefix = (opt("--branch") ?? "").split("/")[0];
  me = byLogin.length > 1 ? byLogin.find((m) => m.id === prefix) : byLogin[0];
} else me = currentMember(cfg);
if (!me) {
  console.error("誰の変更か分からない（npm run kit:whoami -- <id>、または --member / --author）");
  process.exit(1);
}

let files;
if (args.includes("--staged")) files = sh("git diff --cached --name-only --diff-filter=ACMRD");
else if (opt("--base")) files = sh(`git diff --name-only ${opt("--base")}...HEAD`);
else files = `${sh("git diff --name-only HEAD")}\n${sh("git ls-files --others --exclude-standard")}`;
files = [
  ...new Set(
    files
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];

const errors = [];
for (const f of files) {
  const owner = ownerOf(f, cfg);
  if (owner === me.id || owner === "shared") continue;
  errors.push(owner ? `${f}  → 所有者は ${owner}` : `${f}  → 所有者なし（kit.config.json に追加が必要）`);
}

const touchesContracts = files.some((f) => f.startsWith("contracts/") && f !== "contracts/CHANGELOG.md");
if (touchesContracts && !files.includes("contracts/CHANGELOG.md"))
  errors.push("contracts/ を変更したのに contracts/CHANGELOG.md に行がない（docs/rules/changes.md）");

if (errors.length) {
  console.error(`✗ コミットできない変更（${me.id}）:\n  ${errors.join("\n  ")}`);
  console.error("\n他人のファイルが必要なら: 所有者に Issue を立てる。契約が足りないなら: change-request Issue。");
  process.exit(1);
}
console.log(`✓ ${files.length} 件の変更はすべて ${me.id} の範囲内`);
