// npm run scope — 変更が自分の所有範囲に収まっているか、契約変更に CHANGELOG があるかを検査する。
//   --staged          : コミット予定の変更（pre-commit で使う）
//   --base <ref>      : <ref> との差分（CI で使う）
//   --member <id>     : 検査する人（省略時は .kit-member / KIT_MEMBER）
//   --author <login>  : GitHub ログインから人を引く（CI 用）
//   --branch <name>   : 同じログインを複数人で使うとき、ブランチ名の先頭 <id>/ で人を決める（CI 用）
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { STUB_MARK } from "./lib/gaps.mjs";
import { currentMember, loadConfig, ownerOf, p, sh } from "./lib/kit.mjs";

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

// 何と比べるか。オプションなし（npm run check）は「main から分かれた後のブランチ全体＋まだコミットしていない変更」。
// 以前は未コミットの変更だけを見ていたので、コミット直後や main を取り込んだ直後に「0 件」と出て意味が分からなかった（リハーサル3で4人）
// origin/main と手元の main のうち新しい方と比べる（fetch せずに手元の main だけ取り込むと、origin/main が古いまま残り、
// 他人が main に入れた変更まで「範囲外」と出る）
const hasOriginMain = sh("git rev-parse --verify -q origin/main", { allowFail: true }) !== null;
const hasMain = sh("git rev-parse --verify -q main", { allowFail: true }) !== null;
const localAhead =
  hasOriginMain && hasMain && sh("git merge-base --is-ancestor origin/main main", { allowFail: true }) !== null;
const mainRef = hasOriginMain && !localAhead ? "origin/main" : "main";
const forkPoint = sh(`git merge-base HEAD ${mainRef}`, { allowFail: true });
const baseRef = opt("--base") ?? (args.includes("--staged") ? "HEAD" : (forkPoint ?? "HEAD"));
let files;
if (args.includes("--staged")) files = sh("git diff --cached --name-only --diff-filter=ACMRD");
else if (opt("--base")) files = sh(`git diff --name-only ${opt("--base")}...HEAD`);
else
  files = `${forkPoint ? sh(`git diff --name-only ${forkPoint} HEAD`) : ""}\n${sh("git diff --name-only HEAD")}\n${sh("git ls-files --others --exclude-standard")}`;
files = [
  ...new Set(
    files
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];

// 例外: 契約の所有者（lead）が npm run kit:stub で置いた「仮のファイル」（1 行目が KIT-STUB）は、他人の範囲でも入れてよい
const ownsContracts = ownerOf("contracts/api.ts", cfg) === me.id;
const contentOf = (f) =>
  args.includes("--staged")
    ? sh(`git show ":${f}"`, { allowFail: true })
    : opt("--base")
      ? sh(`git show "HEAD:${f}"`, { allowFail: true })
      : existsSync(p(f))
        ? readFileSync(p(f), "utf8")
        : null;

// 例外2: lead の npm run kit:reset。ひな型のままのファイルを「消す」か「scripts/reset/files/ の形にする」変更だけ通す
const reset = existsSync(p("scripts/reset/manifest.json"))
  ? JSON.parse(readFileSync(p("scripts/reset/manifest.json"), "utf8")).files
  : {};
// sh() は出力の末尾を trim するので、比べる時は改行コードと末尾の空白をそろえる（kit-reset.mjs と同じ）
const norm = (s) => s.replace(/\r\n/g, "\n").trimEnd();
const sha = (s) => createHash("sha256").update(norm(s)).digest("hex");
const before = (f) => sh(`git show "${baseRef}:${f}"`, { allowFail: true });
function byReset(f) {
  const m = reset[f];
  if (!ownsContracts || !m) return false;
  const was = before(f);
  if (was === null || sha(was) !== m.sha) return false; // 元がひな型のままでなければ例外にしない
  const now = contentOf(f);
  if (m.action === "delete") return now === null;
  const want = existsSync(p(`scripts/reset/files/${f}`)) ? readFileSync(p(`scripts/reset/files/${f}`), "utf8") : null;
  return now !== null && want !== null && norm(now) === norm(want);
}

const errors = [];
for (const f of files) {
  const owner = ownerOf(f, cfg);
  if (owner === me.id || owner === "shared") continue;
  // .gitignore に入れて管理から外したファイル（例: next-env.d.ts）の削除は誰でもよい
  if (sh(`git check-ignore -q --no-index "${f}"`, { allowFail: true }) !== null) continue;
  if (ownsContracts && (contentOf(f) ?? "").startsWith(STUB_MARK)) continue;
  if (byReset(f)) continue;
  errors.push(owner ? `${f}  → 所有者は ${owner}` : `${f}  → 所有者なし（kit.config.json に追加が必要）`);
}

const touchesContracts = files.some((f) => f.startsWith("contracts/") && f !== "contracts/CHANGELOG.md");
if (touchesContracts && !files.includes("contracts/CHANGELOG.md"))
  errors.push("contracts/ を変更したのに contracts/CHANGELOG.md に行がない（docs/rules/changes.md）");

if (errors.length) {
  console.error(`✗ コミットできない変更（${me.id}）:\n  ${errors.join("\n  ")}`);
  console.error("\n他人のファイルが必要なら: 所有者に Issue を立てる。契約が足りないなら: change-request Issue。");
  if (!args.includes("--staged") && !opt("--base"))
    console.error(
      `自分で触っていないファイルが並んでいるなら: 比べた main（${mainRef}）が古い。git fetch してから、もう一度 npm run check。`,
    );
  process.exit(1);
}
const what = args.includes("--staged")
  ? "コミットする変更"
  : opt("--base")
    ? `${opt("--base")} からの変更`
    : `${mainRef} から分かれた後の変更（未コミットを含む）`;
console.log(`✓ ${what} ${files.length} 件はすべて ${me.id} の範囲内`);
