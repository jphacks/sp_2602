// npm run preflight — 着手宣言（.kit/declare-<id>.json）を、設定・契約・画面・デモ台本と照合する。
// 「理解しました」ではなく、名前が実在するか・所有範囲内かで理解を確かめる。
import { existsSync, readFileSync } from "node:fs";
import { currentMember, loadConfig, ownerOf, p } from "./lib/kit.mjs";

const cfg = loadConfig();
const me = currentMember(cfg);
if (!me) {
  console.error("npm run kit:whoami -- <id> で自分を設定してから");
  process.exit(1);
}

const path = p(`.kit/declare-${me.id}.json`);
if (!existsSync(path)) {
  console.error(`${path.replace(p(""), "")} がない。docs/rules/declare.md の形式で書く`);
  process.exit(1);
}
const d = JSON.parse(readFileSync(path, "utf8"));
const errors = [];
const need = (k) => {
  if (d[k] === undefined || d[k] === "" || (Array.isArray(d[k]) && !d[k].length)) errors.push(`${k} が空`);
};
// ステップ表にない作業（step: X）はデモに効かないことが多いので、demoStep は書かなくてよい（リハーサル4・5で「なし」が弾かれた）
["member", "step", "goal", ...(d.step === "X" ? [] : ["demoStep"]), "files", "doneCheck"].forEach(need);

if (d.member && d.member !== me.id) errors.push(`member が ${d.member}（自分は ${me.id}）`);

// 触るファイルはすべて自分の範囲内か
for (const f of d.files ?? []) {
  const o = ownerOf(f, cfg);
  if (o !== me.id && o !== "shared") errors.push(`files: ${f} は ${o ?? "所有者なし"} のもの`);
}

// 使う契約名は contracts/ に export されているか
const contractSrc = ["contracts/schemas.ts", "contracts/api.ts", "contracts/errors.ts"]
  .filter((f) => existsSync(p(f)))
  .map((f) => readFileSync(p(f), "utf8"))
  .join("\n");
for (const c of d.contracts ?? []) {
  if (!new RegExp(`export\\s+(const|type|interface)\\s+${c}\\b`).test(contractSrc))
    errors.push(`contracts: ${c} は contracts/ に存在しない（このステップで作るなら newContracts に書く）`);
}
// これから作る契約名（契約を変える人＝contracts/ の所有者だけが書ける）
if ((d.newContracts ?? []).length && !(d.files ?? []).some((f) => f.startsWith("contracts/")))
  errors.push("newContracts を書くなら、files に contracts/ のファイルを含める（契約を変えるのは lead）");
for (const c of d.newContracts ?? []) {
  if (new RegExp(`export\\s+(const|type|interface)\\s+${c}\\b`).test(contractSrc))
    errors.push(`newContracts: ${c} は既にある（contracts に書く）`);
}

// 画面 id は screens.md にあるか
const screens = existsSync(p("contracts/screens.md")) ? readFileSync(p("contracts/screens.md"), "utf8") : "";
for (const s of d.screens ?? [])
  if (!screens.includes(`\`${s}\``)) errors.push(`screens: ${s} は contracts/screens.md にない`);

// デモ台本のどこに効くか
const demo = existsSync(p("docs/DEMO.md")) ? readFileSync(p("docs/DEMO.md"), "utf8") : "";
if (d.demoStep && !new RegExp(`\\b${d.demoStep}\\b`).test(demo))
  errors.push(`demoStep: ${d.demoStep} は docs/DEMO.md にない`);
// DEMO.md の台本の行に書かれた画面 id も照合する（リハーサル3: DEMO.md がひな型の home/result のままでも通っていた）
// キックオフ中は DEMO.md と screens.md が書きかけなので、止めずに警告だけ出す
const warnings = [];
const demoRow = demo.split("\n").find((l) => l.startsWith(`| ${d.demoStep} |`));
const rowScreens = [...(demoRow ?? "").matchAll(/`([a-z0-9-]+)`/g)].map((x) => x[1]);
for (const s of rowScreens)
  if (!screens.includes(`\`${s}\``))
    warnings.push(
      `docs/DEMO.md の ${d.demoStep} の画面 ${s} が contracts/screens.md にない（DEMO.md が古いかも。lead に確認）`,
    );
if (rowScreens.length && (d.screens ?? []).length && !(d.screens ?? []).some((s) => rowScreens.includes(s)))
  warnings.push(
    `screens（${d.screens.join(", ")}）が docs/DEMO.md の ${d.demoStep} の画面（${rowScreens.join(", ")}）と合わない`,
  );

// 完了確認は実行できるコマンドか
const pkg = JSON.parse(readFileSync(p("package.json"), "utf8"));
const m = /^npm run (\S+)/.exec(d.doneCheck ?? "");
if (m && !pkg.scripts[m[1]]) errors.push(`doneCheck: npm script '${m[1]}' がない`);

// ステップは自分のメンバーファイルにあるか
const mf = p(`docs/members/${me.id}.md`);
if (d.step && d.step !== "X" && existsSync(mf) && !readFileSync(mf, "utf8").includes(d.step))
  errors.push(`step: ${d.step} は docs/members/${me.id}.md にない`);

if (errors.length) {
  console.error(`✗ 着手宣言が合っていない:\n  ${errors.join("\n  ")}`);
  console.error(`\n読み直す: docs/members/${me.id}.md / contracts/ / docs/DEMO.md`);
  process.exit(1);
}
if (warnings.length) console.log(`! 確認してほしいこと（止めはしない）:\n  ${warnings.join("\n  ")}`);
console.log(`✓ 着手OK: ${d.step} — ${d.goal}`);
console.log(
  `  デモ ${d.demoStep || "なし"} / 契約 ${(d.contracts ?? []).join(", ") || "なし"} / 完了確認: ${d.doneCheck}`,
);
