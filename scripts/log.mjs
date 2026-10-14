// npm run log -- "やったこと・分かったこと・詰まったこと"   1行メモを足す
// npm run log                                              今日の自分のログを見る（同期点の30秒報告はこれを読む）
// npm run log -- --all                                     全部見る
// ステップの開始（npm run step）と完了（npm run merge）は自動で書かれる。手で書くのは「なぜ」「詰まった所」「分かったこと」だけでよい。
// 置き場所はリポジトリの外（scripts/lib/log.mjs）。公開リポジトリには入らない。

import { currentMember } from "./lib/kit.mjs";
import { appendLog, logFile, readLog } from "./lib/log.mjs";

const me = currentMember();
if (!me) {
  console.error("✗ 自分が未設定。npm run kit:whoami -- <id>");
  process.exit(1);
}
const args = process.argv.slice(2);
const text = args
  .filter((a) => !a.startsWith("--"))
  .join(" ")
  .trim();

if (text) {
  const f = appendLog(me.id, "メモ", text);
  if (!f) {
    console.error("✗ ログを書けなかった（KIT_LOG_DIR で置き場所を変えられる）");
    process.exit(1);
  }
  console.log(`✓ 書いた: ${f}`);
  process.exit(0);
}

const all = readLog(me.id);
if (!all) {
  console.log(
    `まだログがない（${logFile(me.id)}）。npm run step / npm run merge で自動で書かれる。メモは npm run log -- "…"`,
  );
  process.exit(0);
}
const d = new Date();
const today = `${d.getMonth() + 1}/${d.getDate()} `;
const lines = all.split("\n").filter((l) => l.startsWith("- "));
const shown = args.includes("--all") ? lines : lines.filter((l) => l.startsWith(`- ${today}`));
console.log(`${logFile(me.id)}（${args.includes("--all") ? "全部" : "今日"} ${shown.length} 件）`);
console.log(shown.join("\n") || "（今日はまだない）");
