// npm run changelog — contracts/ を変えたのに contracts/CHANGELOG.md に行がない変更を止める（docs/rules/changes.md）。
//   --staged     : コミット予定の変更（pre-commit で使う）
//   --base <ref> : <ref> との差分（CI で使う）
import { sh } from "./lib/kit.mjs";

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};

// 初回コミット（キット一式を入れる時）は契約も CHANGELOG も一緒に入るので検査しない
if (sh("git rev-parse --verify -q HEAD", { allowFail: true }) === null) process.exit(0);

// オプションなし（npm run check）は「main から分かれた後のブランチ全体＋まだコミットしていない変更」。
// origin/main と手元の main のうち新しい方と比べる（fetch せずに手元の main だけ取り込むと origin/main が古いまま残るため）
const has = (ref) => sh(`git rev-parse --verify -q ${ref}`, { allowFail: true }) !== null;
const localAhead =
  has("origin/main") &&
  has("main") &&
  sh("git merge-base --is-ancestor origin/main main", { allowFail: true }) !== null;
const mainRef = has("origin/main") && !localAhead ? "origin/main" : "main";
const forkPoint = sh(`git merge-base HEAD ${mainRef}`, { allowFail: true });

// --no-renames: 移動は「元の削除＋先の追加」として両方を数える
let files;
if (args.includes("--staged")) files = sh("git diff --cached --name-only --no-renames --diff-filter=ACMRD");
else if (opt("--base")) files = sh(`git diff --name-only --no-renames ${opt("--base")}...HEAD`);
else
  files = `${forkPoint ? sh(`git diff --name-only --no-renames ${forkPoint} HEAD`) : ""}\n${sh("git diff --name-only HEAD")}\n${sh("git ls-files --others --exclude-standard")}`;
files = [
  ...new Set(
    files
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];

const touchesContracts = files.some((f) => f.startsWith("contracts/") && f !== "contracts/CHANGELOG.md");
if (touchesContracts && !files.includes("contracts/CHANGELOG.md")) {
  console.error("✗ contracts/ を変更したのに contracts/CHANGELOG.md に行がない（docs/rules/changes.md）");
  process.exit(1);
}
console.log(`✓ 契約の変更に CHANGELOG の行がある（変更 ${files.length} 件を確認）`);
