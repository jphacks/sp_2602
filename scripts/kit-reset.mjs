// npm run kit:reset — キックオフで lead が1回だけ実行する。ひな型の例（サブスク判定の analyze 系 API・画面 home/result・固定データ・テスト）を消し、
// 契約を空の状態（scripts/reset/files/）に置き換える。そのあと lead は自分たちの契約を書いて npm run kit:stub。
// 他人の所有ファイル（back の route・テスト、front の画面）も消す・置き換えるが、check-scope は
// 「ひな型のままのファイルを、この決まった形に消す・置き換える」変更だけを例外として通す（scripts/reset/manifest.json で照合）。
// 誰かがすでに手を入れたファイル（ひな型と内容が違う）は触らずに残す。
//   --write-manifest : キットの保守用。今のファイルの内容からマニフェストを作り直す
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { currentMember, loadConfig, ownerOf, p } from "./lib/kit.mjs";

export const DELETE = [
  "src/app/api/analyze/route.ts",
  "src/app/api/analyze-stream/route.ts",
  "src/server/analyze.ts",
  "src/app/home/page.tsx",
  "src/app/result/page.tsx",
];
export const REPLACE = [
  "contracts/schemas.ts",
  "contracts/api.ts",
  "contracts/fixtures.ts",
  "contracts/screens.md",
  "src/lib/flow.tsx",
  "src/app/page.tsx",
  "src/app/api/health/route.ts",
  "tests/server/api.test.ts",
];
const MANIFEST = "scripts/reset/manifest.json";
// check-scope.mjs と同じそろえ方（改行コードと末尾の空白）。git show の出力は末尾が trim されるため
export const norm = (s) => s.replace(/\r\n/g, "\n").trimEnd();
export const sha = (s) => createHash("sha256").update(norm(s)).digest("hex");
const read = (f) => (existsSync(p(f)) ? readFileSync(p(f), "utf8") : null);

if (process.argv.includes("--write-manifest")) {
  const files = {};
  for (const f of DELETE) files[f] = { action: "delete", sha: sha(read(f)) };
  for (const f of REPLACE) files[f] = { action: "replace", sha: sha(read(f)) };
  writeFileSync(p(MANIFEST), `${JSON.stringify({ files }, null, 2)}\n`);
  console.log(`✓ ${MANIFEST} を作り直した（${Object.keys(files).length} 件）`);
  process.exit(0);
}

const cfg = loadConfig();
const me = currentMember(cfg);
if (!me || ownerOf("contracts/api.ts", cfg) !== me.id) {
  console.error("✗ kit:reset は契約の所有者（lead）だけが実行する（npm run kit:whoami -- <id>）");
  process.exit(1);
}
const { files } = JSON.parse(readFileSync(p(MANIFEST), "utf8"));
const done = [];
const kept = [];
for (const [f, m] of Object.entries(files)) {
  const now = read(f);
  if (now === null) continue; // もう無い
  if (sha(now) !== m.sha) {
    kept.push(f); // 誰かが手を入れている。消さない
    continue;
  }
  if (m.action === "delete") unlinkSync(p(f));
  else {
    mkdirSync(dirname(p(f)), { recursive: true });
    writeFileSync(p(f), read(`scripts/reset/files/${f}`));
  }
  done.push(`${m.action === "delete" ? "削除" : "空にした"}  ${f}`);
}
if (done.length) {
  const hhmm = new Date().toTimeString().slice(0, 5);
  appendFileSync(
    p("contracts/CHANGELOG.md"),
    `- ${hhmm} [破壊] npm run kit:reset でひな型の例（Item / Analyze* / api.analyze・analyzeStream / 画面 home・result）を消した — 全員 — なし\n`,
  );
}
console.log(done.length ? `✓ ひな型の例を片付けた:\n  ${done.join("\n  ")}` : "片付けるものはなかった（実行済み）");
if (kept.length) console.log(`! 内容が変わっていたので残した（手で確かめる）:\n  ${kept.join("\n  ")}`);
console.log(
  "\n次: kit.config.json の画面の所有（home/result）を自分たちの画面 id に書き換え → 契約を書く → npm run kit:stub → npm run check → commit（範囲チェックは kit:reset の変更を例外で通す）",
);
