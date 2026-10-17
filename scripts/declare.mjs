// npm run declare -- demoStep=D2 screens=parent-rules contracts=Rules,RulesSave files=src/app/parent-rules/index.tsx goal="…"
// 着手宣言（.kit/declare-<id>.json）を、JSON を手で編集せずに埋める。書いたあと preflight を自動で実行する。
// 配列の項目（screens / contracts / newContracts / files）はカンマ区切り。値を空にすると消える（例: contracts=）。「なし」「none」「-」も空。
// preflight が通ったら、このブランチの「下書きの PR」を作る（なければ）。誰が何に着手したかを GitHub で全員に見せるため（npm run status）。
//   もうあれば、宣言が変わった時だけ PR にコメントで残す。--no-pr で作らない。失敗しても宣言は有効（注意を出すだけ）
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { currentMember, loadConfig, p, sh } from "./lib/kit.mjs";

const ARRAYS = ["screens", "contracts", "newContracts", "files"];
const STRINGS = ["step", "goal", "demoStep", "doneCheck"];

const me = currentMember(loadConfig());
if (!me) {
  console.error("✗ 自分が未設定。npm run kit:whoami -- <id>");
  process.exit(1);
}
const path = p(`.kit/declare-${me.id}.json`);
const d = existsSync(path)
  ? JSON.parse(readFileSync(path, "utf8"))
  : {
      member: me.id,
      step: "",
      goal: "",
      demoStep: "",
      screens: [],
      contracts: [],
      files: [],
      doneCheck: "npm run check",
    };

const noPr = process.argv.includes("--no-pr");
const args = process.argv.slice(2).filter((a) => a !== "--no-pr");
if (!args.length) {
  console.log(JSON.stringify(d, null, 2));
  console.log(`\n使い方: npm run declare -- ${[...STRINGS, ...ARRAYS].map((k) => `${k}=…`).join(" ")} [--no-pr]`);
  process.exit(0);
}
for (const a of args) {
  const i = a.indexOf("=");
  const key = a.slice(0, i);
  const value = a.slice(i + 1);
  if (i < 0 || ![...ARRAYS, ...STRINGS].includes(key)) {
    console.error(`✗ 分からない項目: ${a}（使えるもの: ${[...STRINGS, ...ARRAYS].join(", ")}）`);
    process.exit(1);
  }
  // 「使わない」は空で書く（contracts= ）。なし / none / - も空として受け付ける（リハーサル3で4人が「なし」と書いて弾かれた）
  const NONE = ["なし", "無し", "none", "-"];
  d[key] = ARRAYS.includes(key)
    ? value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && !NONE.includes(s.toLowerCase()))
    : key === "demoStep" && NONE.includes(value.trim().toLowerCase())
      ? "" // docs/rules/declare.md が案内する demoStep=なし（デモに効かない X ステップ）も空にする
      : value;
}
d.member = me.id;
mkdirSync(p(".kit"), { recursive: true });
writeFileSync(path, `${JSON.stringify(d, null, 2)}\n`);
console.log(`.kit/declare-${me.id}.json を更新した。preflight を実行する:\n`);
const r = spawnSync(process.execPath, [p("scripts/preflight.mjs")], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
if (!noPr) draftPr();
process.exit(0);

function draftPr() {
  const warn = (msg) => console.log(`\n! 下書き PR: ${msg}（作業は続けてよい。作らないなら --no-pr）`);
  const run = (cmd, a) =>
    execFileSync(cmd, a, { cwd: p(""), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const errText = (e) =>
    String(e.stderr || e.message)
      .trim()
      .split("\n")
      .slice(-2)
      .join(" ");
  if (!sh("git remote get-url origin", { allowFail: true })) return; // remote なし（手元だけの試し）
  const branch = sh("git symbolic-ref --short HEAD", { allowFail: true }) ?? "";
  if (!branch.startsWith(`${me.id}/`))
    return warn(
      `ブランチ ${branch || "?"} が ${me.id}/ で始まっていないので作らない（npm run step で作ったブランチで）`,
    );
  const contracts = (d.contracts ?? []).join(", ") || "なし";
  const files = (d.files ?? []).join(", ");
  const summary = [
    `- ステップ: ${d.step}`,
    `- goal: ${d.goal}`,
    `- demoStep: ${d.demoStep || "なし"}`,
    `- 使った契約: ${contracts}`,
    `- 触るファイル: ${files}`,
  ].join("\n");
  const posted = p(`.kit/declare-${me.id}.posted`);

  let pr = null;
  try {
    pr = JSON.parse(run("gh", ["pr", "view", "--json", "number,state"]));
  } catch {}
  if (pr?.state === "OPEN") {
    const record = `${pr.number}\n${summary}`;
    if (existsSync(posted) && readFileSync(posted, "utf8") === record) return; // 前に残した宣言と同じ
    try {
      run("gh", ["pr", "comment", String(pr.number), "--body", `着手宣言を更新:\n${summary}`]);
      writeFileSync(posted, record);
      console.log(`\n✓ PR #${pr.number} に着手宣言をコメントした`);
    } catch (e) {
      warn(`PR #${pr.number} にコメントできなかった: ${errText(e)}`);
    }
    return;
  }

  // PR は差分がないと作れないので、まだコミットがなければ空のコミット（着手の印）を1つ積む。マージはスカッシュなので main には残らない
  if (sh("git diff --cached --quiet", { allowFail: true }) === null)
    return warn(
      "add 済みでまだコミットしていない変更があるので、空のコミットを作らない（commit してから npm run declare をもう一度）",
    );
  try {
    const ahead = Number(sh("git rev-list --count origin/main..HEAD", { allowFail: true }) ?? 0);
    if (!ahead) run("git", ["commit", "--allow-empty", "-q", "-m", `${d.step} 着手: ${d.goal}`]);
    run("git", ["push", "-q", "-u", "origin", branch]);
  } catch (e) {
    return warn(`commit / push できなかった: ${errText(e)}（Codex ならサンドボックスの外での実行を承認）`);
  }
  const template = existsSync(p(".github/pull_request_template.md"))
    ? readFileSync(p(".github/pull_request_template.md"), "utf8")
    : "## 着手宣言\n- ステップ: S?\n";
  const filled = template
    .replace(/^- ステップ:.*$/m, `- ステップ: ${d.step}`)
    .replace(/^- goal:.*$/m, `- goal: ${d.goal}`)
    .replace(/^- demoStep:.*$/m, `- demoStep: ${d.demoStep || "なし"}`)
    .replace(/^- 使った契約:.*$/m, `- 使った契約: ${contracts}\n- 触るファイル: ${files}`);
  const body = `> 下書き（作業中）。終わったら「完了確認」に doneCheck の出力を貼り、npm run merge（下書きは自動で解除される）\n\n${filled}`;
  try {
    const url = run("gh", ["pr", "create", "--draft", "--title", `${d.step} ${d.goal}`, "--body", body]);
    writeFileSync(posted, `${/\/pull\/(\d+)/.exec(url)?.[1] ?? "?"}\n${summary}`);
    console.log(`\n✓ 下書きの PR を作った: ${url}（npm run status で全員に「作業中」と見える）`);
  } catch (e) {
    warn(`PR を作れなかった: ${errText(e)}`);
  }
}
