// npm run kit:reset — キックオフで lead が1回だけ実行する。ひな型の例（制限ルール rules 系・使用状況 usage 系の API・画面 role/parent-rules/parent-usage/child-home・固定データ・テーブル・テスト）を消し、
// 契約を空の状態（scripts/reset/files/）に置き換える。そのあと lead は自分たちの契約を書いて npm run kit:stub。
// back の API の処理・front の画面も消す・置き換えるが、照合は scripts/reset/manifest.json の内容（sha）で行い、
// 誰かがすでに手を入れたファイル（ひな型と内容が違う）は触らずに残す。
//   --write-manifest : キットの保守用。今のファイルの内容からマニフェストを作り直す
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { currentMember, isLead, loadConfig, p } from "./lib/kit.mjs";

// 消すもの: ひな型の例の API の処理・サーバの関数・画面（制限ルール rules 系と使用状況 usage 系）。
// 残すもの（基盤）: health、src/lib/api.ts・native.ts、src/app/_layout.tsx、contracts/errors.ts・native.ts・tokens.ts、src/server/（app・route・errors・env・dev・db/index.ts）。
export const DELETE = [
  "src/server/handlers/rulesGet.ts",
  "src/server/handlers/rulesSave.ts",
  "src/server/handlers/rulesSyncStream.ts",
  "src/server/handlers/usageGet.ts",
  "src/server/handlers/usageReport.ts",
  "src/server/rules.ts",
  "src/server/usage.ts",
  "src/app/role/index.tsx",
  "src/app/parent-rules/index.tsx",
  "src/app/parent-usage/index.tsx",
  "src/app/child-home/index.tsx",
];
// 空に置き換えるもの: files/ に同じ道筋で置いた「空の形」を書く
export const REPLACE = [
  "contracts/schemas.ts",
  "contracts/api.ts",
  "contracts/fixtures.ts",
  "contracts/screens.md",
  "src/lib/flow.tsx",
  "src/app/index.tsx",
  "src/server/handlers/index.ts",
  "src/server/db/schema.ts",
  "tests/contracts.test.ts",
  "tests/lib/api.test.ts",
  "tests/server/api.test.ts",
  "tests/server/db.test.ts",
];
const MANIFEST = "scripts/reset/manifest.json";
// 改行コードと末尾の空白をそろえて比べる
export const norm = (s) => s.replace(/\r\n/g, "\n").trimEnd();
export const sha = (s) => createHash("sha256").update(norm(s)).digest("hex");
const read = (f) => (existsSync(p(f)) ? readFileSync(p(f), "utf8") : null);

// テスト（tests/contracts.test.ts）は DELETE・REPLACE・sha を読み込むだけ。読み込んだだけで片付けが走らないよう、
// node scripts/kit-reset.mjs として直接動かしたときだけ実行する
const isMain = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();

function main() {
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
  if (!isLead(cfg, me)) {
    console.error(
      "✗ kit:reset は lead（kit.config.json の members の先頭）だけが実行する（npm run kit:whoami -- <id>）",
    );
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
      `- ${hhmm} [破壊] npm run kit:reset でひな型の例（Role / Child / Rules* / Usage* / api.rulesGet・rulesSave・rulesSyncStream・usageGet・usageReport / テーブル rules・usage / 画面 role・parent-rules・parent-usage・child-home）を消した。AppLimit・AppUsage は contracts/native.ts が使うので残した — 全員 — なし\n`,
    );
  }
  console.log(done.length ? `✓ ひな型の例を片付けた:\n  ${done.join("\n  ")}` : "片付けるものはなかった（実行済み）");
  if (kept.length) console.log(`! 内容が変わっていたので残した（手で確かめる）:\n  ${kept.join("\n  ")}`);
  console.log(
    "\n次: docs/rules/team.md の手順で、kit.config.json・docs/members の「機能A・B」を実際の機能名に書き換え → 契約を書く → npm run kit:stub → npm run check → commit",
  );
}
