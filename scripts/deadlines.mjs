// npm run kit:deadlines — 締め切り（運営が決めた時刻）と、それまでにやること（担当・優先度・完了）の一覧。
//   npm run kit:deadlines -- issues   やることを1件ずつ Issue にする（ラベル deadline・担当に assign）。終わったら Issue を閉じる＝完了。
//                                     まとめ役が前日（GitHub の準備のあと）に1回。何度実行しても、もうあるものは作らない
// やることの中身は kit.config.json の deadlines。npm run now と kit:alarm が担当者に知らせる。
import { execFileSync } from "node:child_process";
import {
  deadlineIssues,
  deadlines,
  fmtWhen,
  MARK,
  ownersOf,
  ownerText,
  PRIORITY,
  renderDeadline,
} from "./lib/deadlines.mjs";
import { currentMember, loadConfig, sharesAccount } from "./lib/kit.mjs";

const cfg = loadConfig();
const me = currentMember(cfg);
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const all = deadlines(cfg);
if (!all.length) fail("kit.config.json に deadlines がない");

const issues = deadlineIssues();
if (process.argv[2] !== "issues") {
  for (const d of all) console.log(`${renderDeadline(d, cfg, issues, { me }).join("\n")}\n`);
  console.log(
    issues === null
      ? "（GitHub の Issue を取得できないので完了は未確認。gh auth status を確認）"
      : "✓ 完了 / ✗ 未完了（Issue が開いている） / ・ Issue がまだない → npm run kit:deadlines -- issues",
  );
  process.exit(0);
}

if (issues === null) fail("gh で Issue を取得できない（gh auth status / remote を確認）");
const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
// ラベルがなければ作る（もうあるものは色・説明を含めて触らない）
let labels;
try {
  labels = new Set(JSON.parse(gh("label", "list", "--limit", "500", "--json", "name")).map((l) => l.name));
} catch (e) {
  fail(`ラベルの一覧を取得できない: ${String(e.stderr ?? e.message).trim()}`);
}
const label = (name, color, description) => {
  if (labels.has(name)) return;
  try {
    gh("label", "create", name, "--color", color, "--description", description);
    labels.add(name);
  } catch (e) {
    fail(`ラベル ${name} を作れない: ${String(e.stderr ?? e.message).trim()}`);
  }
};
label("deadline", "FBCA04", "締め切りまでにやること（npm run kit:deadlines）。閉じたら完了");

let made = 0;
for (const d of all) {
  for (const i of d.items) {
    if (issues.has(i.key)) continue;
    const owners = ownersOf(i, cfg)
      .map((id) => cfg.members.find((m) => m.id === id))
      .filter(Boolean);
    if (!owners.length) fail(`${i.key} の owner（${ownerText(i)}）が members にない`);
    const body = [
      `- 締め切り: ${d.name}（${fmtWhen(d.at)}）${i.by ? ` / このやることは ${fmtWhen(i.by)} まで` : ""}`,
      `- 優先度: ${PRIORITY[i.priority]}`,
      `- 担当: ${ownerText(i)}`,
      "",
      "終わったらこの Issue を閉じる（PR で終えるなら PR 本文に `Closes #この番号`）。閉じると npm run now / status / kit:alarm で完了になる。",
      "",
      MARK(i.key),
    ].join("\n");
    const args = ["issue", "create", "--title", `【${d.name}】${i.what}`, "--body", body, "--label", "deadline"];
    for (const m of owners) {
      // 同じ GitHub アカウントを複数人で使うとき（リハーサル等）は assign ではなく member:<id> ラベル
      if (sharesAccount(cfg, m)) {
        label(`member:${m.id}`, "C5DEF5", `${m.id} が対応する`);
        args.push("--label", `member:${m.id}`);
      } else args.push("--assignee", m.github);
    }
    try {
      console.log(`✓ ${gh(...args)}  ${i.key}（${ownerText(i)}・${PRIORITY[i.priority]}）`);
      made++;
    } catch (e) {
      fail(`${i.key} の Issue を作れなかった: ${String(e.stderr ?? e.message).trim()}`);
    }
  }
}
console.log(made ? `\n${made} 件の Issue を作った` : "作る Issue はなかった（全部ある）");
