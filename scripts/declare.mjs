// npm run declare -- demoStep=D2 screens=home contracts=Item,AnalyzeRequest files=src/app/home/page.tsx goal="…"
// 着手宣言（.kit/declare-<id>.json）を、JSON を手で編集せずに埋める。書いたあと preflight を自動で実行する。
// 配列の項目（screens / contracts / newContracts / files）はカンマ区切り。値を空にすると消える（例: contracts=）。「なし」「none」「-」も空。
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { currentMember, loadConfig, p } from "./lib/kit.mjs";

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

const args = process.argv.slice(2);
if (!args.length) {
  console.log(JSON.stringify(d, null, 2));
  console.log(`\n使い方: npm run declare -- ${[...STRINGS, ...ARRAYS].map((k) => `${k}=…`).join(" ")}`);
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
    : value;
}
d.member = me.id;
mkdirSync(p(".kit"), { recursive: true });
writeFileSync(path, `${JSON.stringify(d, null, 2)}\n`);
console.log(`.kit/declare-${me.id}.json を更新した。preflight を実行する:\n`);
const r = spawnSync(process.execPath, [p("scripts/preflight.mjs")], { stdio: "inherit" });
process.exit(r.status ?? 1);
