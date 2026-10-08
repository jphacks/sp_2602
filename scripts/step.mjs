// npm run step -- S2 [短い英語名]
// ステップを始める: 最新の main から <自分のid>/S2-<名前> ブランチを作り、着手宣言のひな型を .kit/ に用意する。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { currentMember, loadConfig, p, sh } from "./lib/kit.mjs";

const [step, rawName] = process.argv.slice(2);
const cfg = loadConfig();
const me = currentMember(cfg);
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

if (!me) fail("自分が未設定。npm run kit:whoami -- <id>");
if (!/^S\d+$/.test(step ?? "")) fail("使い方: npm run step -- S2 [短い英語名]（例: npm run step -- S2 input-form）");

// ステップは自分のメンバーファイルにあるか
const mf = p(`docs/members/${me.id}.md`);
const line = existsSync(mf)
  ? readFileSync(mf, "utf8")
      .split("\n")
      .find((l) => new RegExp(`^- \\[( |x)\\] ${step}\\b`).test(l))
  : undefined;
if (!line) fail(`${step} は docs/members/${me.id}.md にない`);
if (line.startsWith("- [x]")) console.log(`! ${step} は完了済み（[x]）になっている。続きをやるならこのまま進めてよい`);

// 未コミットの変更があるとブランチを移れない
const dirty = sh("git status --porcelain", { allowFail: true });
if (dirty) fail("未コミットの変更がある。先に commit（今のステップの PR）か git stash してから");

const name =
  (rawName ?? "work")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "work";
const branch = `${me.id}/${step}-${name}`;

// 最新の main から作る
const hasRemote = !!sh("git remote get-url origin", { allowFail: true });
if (hasRemote) {
  if (sh("git fetch -q origin main", { allowFail: true }) === null)
    fail("git fetch に失敗（ネットワークか認証を確認）");
}
const base = hasRemote ? "origin/main" : "main";
if (sh(`git rev-parse --verify -q refs/heads/${branch}`, { allowFail: true }) !== null) {
  sh(`git checkout -q ${branch}`);
  console.log(`既にあるブランチ ${branch} に切り替えた（作り直していない）`);
} else {
  if (sh(`git checkout -q -b ${branch} ${base}`, { allowFail: true }) === null)
    fail(`${base} からブランチを作れなかった`);
  console.log(`✓ ${base} から ${branch} を作った`);
}

// 着手宣言のひな型（既にあれば残す）
mkdirSync(p(".kit"), { recursive: true });
const decl = p(`.kit/declare-${me.id}.json`);
const doneCheck = /完了確認: `([^`]+)`/.exec(line)?.[1] ?? "npm run check";
const goal = line
  .replace(/^- \[( |x)\] S\d+\s*/, "")
  .replace(/\s*— 完了確認:.*$/, "")
  .trim();
const prev = existsSync(decl) ? JSON.parse(readFileSync(decl, "utf8")) : null;
if (prev?.step === step) {
  console.log(`着手宣言 .kit/declare-${me.id}.json は ${step} のものが既にある（そのまま）`);
} else {
  const template = { member: me.id, step, goal, demoStep: "", screens: [], contracts: [], files: [], doneCheck };
  writeFileSync(decl, `${JSON.stringify(template, null, 2)}\n`);
  console.log(
    `✓ 着手宣言のひな型を .kit/declare-${me.id}.json に作った（npm run declare -- demoStep=… files=… screens=… contracts=… で埋める）`,
  );
}

console.log(
  `\n次: npm run declare -- … で宣言を埋める（preflight も走る） → 実装 → ${doneCheck === "npm run check" ? "" : `${doneCheck} → `}npm run check → commit → git push -u origin ${branch} → PR`,
);
