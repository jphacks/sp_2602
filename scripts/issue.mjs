// npm run issue -- <種類> <宛先id> "<題名>" ["<本文>"] [--body-file <path>] [--force]
//   種類: bug / task / blocked / change-request / help
//   宛先: その Issue に「対応する人」の id（自分ではなく、直す・決める人）。change-request は普通 lead
// 本文が複数行なら --body-file <path>（"-" なら標準入力）を使う。Windows の npm は引数を cmd.exe に通すので、
//   引数の本文は最初の改行で切れ、後ろの引数（--dry-run など）も落ちる（リハーサル3で Issue #3・#6 の本文が消えた）。
// --dry-run: 似た Issue の確認だけ。立てる前に、似た題名の open な Issue を探す。似たものがあれば立てずに止まる（そちらにコメントする。違うなら --force）。
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { currentMember, loadConfig, sh } from "./lib/kit.mjs";

const TYPES = ["bug", "task", "blocked", "change-request", "help"];
const args = process.argv.slice(2);
const force = args.includes("--force");
const dryRun = args.includes("--dry-run"); // 似た Issue の確認だけして、作らない
const fileAt = args.indexOf("--body-file");
const bodyFile = fileAt >= 0 ? args[fileAt + 1] : undefined;
const isBodyFileArg = (i) => fileAt >= 0 && (i === fileAt || i === fileAt + 1);
const positional = args.filter((a, i) => a !== "--force" && a !== "--dry-run" && !isBodyFileArg(i));
const [type, to, title, inlineBody = ""] = positional;
const cfg = loadConfig();
const me = currentMember(cfg);
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

if (!me) fail("自分が未設定。npm run kit:whoami -- <id>");
if (fileAt >= 0 && !bodyFile) fail("--body-file の後にファイルのパス（標準入力なら -）を書く");
if (bodyFile && inlineBody) fail("本文は引数か --body-file のどちらか一方で渡す");
let body = inlineBody;
if (bodyFile) {
  try {
    body = readFileSync(bodyFile === "-" ? 0 : bodyFile, "utf8").trim();
  } catch (e) {
    fail(`本文のファイルを読めない: ${bodyFile}（${e.message}）`);
  }
  if (!body) fail(`本文が空: ${bodyFile}`);
}
if (!TYPES.includes(type ?? "") || !to || !title)
  fail(
    `使い方: npm run issue -- <${TYPES.join("|")}> <宛先id> "<題名>" ["<1行の本文>" | --body-file <path>]（宛先は対応する人。複数行の本文は --body-file）`,
  );
const target = cfg.members.find((m) => m.id === to);
if (!target) fail(`宛先 ${to} は kit.config.json の members にない（${cfg.members.map((m) => m.id).join(", ")}）`);
if (type === "change-request" && to !== cfg.members[0].id)
  console.log(`! change-request の宛先は普通 ${cfg.members[0].id}（契約の所有者）`);

// 似た Issue を探す: 文字の 2-gram の重なりで比べる（日本語でも効く）
const grams = (s) => {
  const t = s.toLowerCase().replace(/[\s[\]【】「」()（）:：、。,.!！?？#\-_/]/g, "");
  return new Set([...t].map((_, i) => t.slice(i, i + 2)).filter((g) => g.length === 2));
};
const sim = (a, b) => {
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const g of A) if (B.has(g)) n++;
  return (2 * n) / (A.size + B.size);
};
let open = [];
try {
  open = JSON.parse(sh("gh issue list --state open --limit 200 --json number,title,labels,assignees") ?? "[]");
} catch {
  fail("gh で Issue を取得できない（gh auth status / ネットワークを確認）");
}
// 宛先: 普段は assignee。同じ GitHub アカウントを複数人で使うときは member:<id> ラベル（docs/rules/git.md）
const shared = cfg.members.filter((m) => m.github.toLowerCase() === target.github.toLowerCase()).length > 1;
const sameTarget = (i) =>
  shared
    ? i.labels?.some((l) => l.name === `member:${to}`)
    : i.assignees?.some((a) => a.login.toLowerCase() === target.github.toLowerCase());
const similar = open
  .filter(sameTarget)
  .map((i) => ({ ...i, score: sim(title, i.title) }))
  .filter((i) => i.score >= 0.5);
if (similar.length && !force) {
  console.error("✗ 似た Issue がすでにある。新しく立てずに、そちらにコメントする:");
  for (const i of similar.sort((a, b) => b.score - a.score).slice(0, 5))
    console.error(
      `  #${i.number} ${i.title}（似ている度 ${Math.round(i.score * 100)}%）  → gh issue comment ${i.number} --body "…"`,
    );
  console.error("別の件なら --force を付けて立てる");
  process.exit(1);
}

if (dryRun) {
  console.log(`✓ 似た Issue はない。作るなら: ${type} → ${to}「${title}」（--dry-run なので作らない）`);
  process.exit(0);
}
const fullBody = `${body}\n\n---\n起票: ${me.id} / 対応する人: ${to}`;
// シェルを通さずに gh を直接呼ぶ（Windows の cmd でも改行・引用符が壊れない）
const ghArgs = ["issue", "create", "--title", title, "--body", fullBody, "--label", type];
ghArgs.push(...(shared ? ["--label", `member:${to}`] : ["--assignee", target.github]));
let url = "";
try {
  url = execFileSync("gh", ghArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
} catch (e) {
  fail(`Issue を作れなかった（ラベルがあるか・gh の認証を確認）: ${String(e.stderr ?? e.message).trim()}`);
}
console.log(`✓ ${url}（${type} → ${to}）`);
