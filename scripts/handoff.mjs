// npm run handoff — 期限つきの委託（貸し出し）。手が回らない人のファイルを、決めた期限まで手伝う人の担当にする（docs/rules/help.md の「2. 切り出し」）。
//   npm run handoff                                            貸し出しの一覧と期限
//   npm run handoff -- lend <借りる人id> <ファイル…> --issue <番号>   貸す（kit.config.json の loans に1件足す）
//   npm run handoff -- return <番号>                             返す（その help Issue の貸し出しを消す）
// 貸せるのは、そのファイルの持ち主本人・まとめ役（facilitator）・lead。ファイルは1つずつ名前で書く（まだないファイルでもよい。* は使えない）。
// 貸している間は、hook・npm run check・CI・着手宣言が、そのファイルを「借りた人のもの」として扱う。レビュー役（CODEOWNERS）は持ち主のまま。
// 期限は貸した後の最初の同期点。過ぎると npm run now / npm run status が「返す」と知らせる。
// kit.config.json は lead の所有だが、loans だけを変える変更は npm run scope が通す（scripts/check-scope.mjs の例外4）。
import { readFileSync, writeFileSync } from "node:fs";
import {
  baseOwnerOf,
  clock,
  currentMember,
  fmtTime,
  helpPhase,
  loadConfig,
  loanDue,
  loanProblem,
  p,
  sh,
} from "./lib/kit.mjs";

const cfg = loadConfig();
const me = currentMember(cfg);
const now = clock();
const args = process.argv.slice(2);
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const issueAt = args.indexOf("--issue");
const issueArg = issueAt >= 0 ? args[issueAt + 1] : undefined;
const [cmd, ...rest] = args.filter((_, i) => issueAt < 0 || (i !== issueAt && i !== issueAt + 1));
const loans = cfg.loans ?? [];

const describe = (l) => {
  const due = loanDue(cfg, l);
  const expired = due && new Date(due.at) <= now;
  return `#${l.issue} ${l.from} → ${l.to}: ${l.files.join(", ")}  期限: ${due ? `${fmtTime(due.at)} ${due.name}` : "なし"}${expired ? "  ← 期限切れ（返す）" : ""}`;
};

if (!cmd) {
  console.log(loans.length ? `貸し出し中 ${loans.length} 件` : "貸し出し中のファイルはない");
  for (const l of loans) console.log(`- ${describe(l)}`);
  process.exit(0);
}
if (!me) fail("自分が未設定。npm run kit:whoami -- <id>");
if (!Array.isArray(cfg.loans)) fail('kit.config.json に "loans": [] がない → lead に頼む');

// loans の配列だけを書き換える（他の行の書き方・コメントはそのまま残す）。文字列の中の [ ] は数えない（例: src/app/[id]/page.tsx）
function writeLoans(next) {
  const original = readFileSync(p("kit.config.json"), "utf8");
  const start = original.indexOf('"loans": [');
  if (start < 0) fail('kit.config.json の "loans": [ が見つからない');
  let i = start + '"loans": '.length;
  let depth = 0;
  let inString = false;
  for (; i < original.length; i++) {
    const c = original[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) break;
  }
  const block = `"loans": ${JSON.stringify(next)}`;
  writeFileSync(p("kit.config.json"), original.slice(0, start) + block + original.slice(i + 1));
  // 改行・空白は Biome にそろえさせる（npm run lint の biome ci が通る形にする）
  sh("npx biome format --write kit.config.json", { allowFail: true });
  // 読み直して、loans 以外が変わっていないか・loans が狙いどおりかを確かめる。違えば元に戻す
  try {
    const after = loadConfig();
    const strip = (c) => JSON.stringify({ ...c, loans: null });
    if (strip(after) === strip(cfg) && JSON.stringify(after.loans) === JSON.stringify(next)) return;
  } catch {}
  writeFileSync(p("kit.config.json"), original);
  fail("kit.config.json の書き換えが期待どおりにならなかったので元に戻した（lead に相談）");
}

const nextSteps = (what) =>
  console.log(`次: この変更（kit.config.json の loans だけ）を${what}の PR にして入れる。
  npm run step -- X handoff-${issueArg ?? rest[0]} --adhoc "合流 #${issueArg ?? rest[0]}"（main にいるなら）→ npm run check → commit → push → npm run merge
  main に入るまで、相手の手元では貸し出しが効かない`);

if (cmd === "lend") {
  const [to, ...files] = rest;
  if (!to || !files.length || !issueArg)
    fail("使い方: npm run handoff -- lend <借りる人id> <ファイル…> --issue <help Issue の番号>");
  const phase = helpPhase(cfg, now);
  if (phase.mode !== "carve")
    fail(`今は「${phase.text}」の時間帯。ファイルを貸してコードを増やす合流はしない（docs/rules/help.md）`);
  const norm = [...new Set(files.map((f) => f.replace(/\\/g, "/").replace(/^\.\//, "")))];
  const from = baseOwnerOf(norm[0], cfg);
  const loan = { issue: Number(issueArg), from, to, at: now.toISOString(), files: norm };
  const problem = loanProblem(loan, cfg, me.id);
  if (problem) fail(problem);
  writeLoans([...loans, loan]);
  console.log(`✓ 貸した: ${describe(loan)}`);
  console.log(
    `  ${to} は着手宣言の files にこのファイルを書ける。終わったら（遅くとも期限で）npm run handoff -- return ${loan.issue}`,
  );
  nextSteps("貸すため");
} else if (cmd === "return") {
  const n = Number(rest[0] ?? issueArg);
  if (!Number.isInteger(n) || n <= 0) fail("使い方: npm run handoff -- return <help Issue の番号>");
  const hit = loans.filter((l) => l.issue === n);
  if (!hit.length) fail(`#${n} の貸し出しはない（npm run handoff で一覧）`);
  const bad = hit.find((l) => ![l.from, l.to, cfg.facilitator, cfg.members[0].id].includes(me.id));
  if (bad) fail(`返せるのは貸した人（${bad.from}）・借りた人（${bad.to}）・まとめ役・lead だけ`);
  writeLoans(loans.filter((l) => l.issue !== n));
  console.log(`✓ 返した: #${n}（${hit.flatMap((l) => l.files).join(", ")} は持ち主に戻る）`);
  console.log("  借りた人の PR がまだマージされていなければ、先にマージしてから返す（返した後は範囲外になる）");
  nextSteps("返すため");
} else fail("使い方: npm run handoff [-- lend <借りる人id> <ファイル…> --issue <番号> | return <番号>]");
