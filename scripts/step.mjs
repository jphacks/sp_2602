// npm run step -- S2 [短い英語名]
// ステップを始める: 最新の main から <自分のid>/S2-<名前> ブランチを作り、着手宣言のひな型を .kit/ に用意する。
// ステップ表にない作業（動画・計測・同期点の準備など）: npm run step -- X <短い英語名> --adhoc "目的"
//   → <自分のid>/X-<名前> ブランチ。ステップの完了には数えない。PR 本文に「なぜステップ外か」を書く。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { currentMember, loadConfig, p, sh, stepStates } from "./lib/kit.mjs";
import { appendLog, setNow } from "./lib/log.mjs";

const argv = process.argv.slice(2);
const adhocAt = argv.indexOf("--adhoc");
const adhoc = adhocAt >= 0;
const adhocGoal = adhoc ? argv[adhocAt + 1] : undefined;
const [step, rawName] = argv.filter((_, i) => !adhoc || (i !== adhocAt && i !== adhocAt + 1));
const cfg = loadConfig();
const me = currentMember(cfg);
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

if (!me) fail("自分が未設定。npm run kit:whoami -- <id>");
if (adhoc) {
  if (step !== "X" || !adhocGoal) fail('使い方: npm run step -- X <短い英語名> --adhoc "目的"（目的は必須）');
} else if (!/^S\d+$/.test(step ?? ""))
  fail(
    '使い方: npm run step -- S2 [短い英語名]（例: npm run step -- S2 input-form）。ステップ表にない作業は npm run step -- X <名前> --adhoc "目的"',
  );

let line;
if (adhoc) {
  line = `- X ${adhocGoal}`;
  console.log("! ステップ表にない作業として始める（完了には数えない）。PR 本文に「なぜステップ外か」を1行書く");
} else {
  // ステップは自分のメンバーファイルにあるか・もう終わっていないか（完了はマージ済み PR から判定）
  const st = stepStates(me);
  const found = st?.steps.find((s) => s.id === step);
  if (!found)
    fail(
      `${step} は docs/members/${me.id}.md にない（ステップ表にない作業なら npm run step -- X <名前> --adhoc "目的"）`,
    );
  if (found.state === "done")
    console.log(`! ${step} はマージ済みの PR がある。追加の修正なら続けてよい（新しい作業なら次のステップへ）`);
  if (found.state === "wip") console.log(`! ${step} は下書きの PR #${found.pr} で作業中。続きならそのブランチで続ける`);
  if (found.state === "pr")
    console.log(`! ${step} は PR #${found.pr} がマージ待ち。追加の修正ならそのブランチで続ける`);
  line = `- ${found.id} ${found.text}`;
}

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
  .replace(/^- (S\d+|X)\s*/, "")
  .replace(/\s*— 完了確認:.*$/, "")
  .trim();
const prev = existsSync(decl) ? JSON.parse(readFileSync(decl, "utf8")) : null;
// 同じステップのやり直しだけ前の宣言を残す。X（ステップ表にない作業）は毎回 step が同じ "X" なので、目的も同じときだけ残す
// （以前は step だけで比べ、前の X の目的と files が次の X に残って、PR の題名が前の作業のままになった。リハーサル6）
if (prev?.step === step && prev?.goal === goal) {
  console.log(`着手宣言 .kit/declare-${me.id}.json は ${step} のものが既にある（そのまま）`);
} else {
  const template = { member: me.id, step, goal, demoStep: "", screens: [], contracts: [], files: [], doneCheck };
  writeFileSync(decl, `${JSON.stringify(template, null, 2)}\n`);
  console.log(
    `✓ 着手宣言のひな型を .kit/declare-${me.id}.json に作った（npm run declare -- demoStep=… files=… screens=… contracts=… で埋める）`,
  );
}

// 個人の作業ログ（リポジトリの外。npm run log で見る）
appendLog(me, "開始", `${step} ${goal}（${branch}）`);
setNow(me, `${step} ${goal}（${branch}）`);

console.log(
  `\n次: npm run declare -- … で宣言を埋める（preflight が通ると下書きの PR ができる） → 実装 → ${doneCheck === "npm run check" ? "" : `${doneCheck} → `}npm run check → commit → git push → PR 本文の完了確認を埋めて npm run merge`,
);
