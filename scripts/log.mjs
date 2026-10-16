// 個人の作業ファイル（リポジトリの外。置き場所と仕組みは scripts/lib/log.mjs）。1回 = 1行。AI はファイルを読まずにこのコマンドで書くだけ。
//   npm run log                          今日のログと、開いている項目の件数（同期点の30秒報告はこれを読む）
//   npm run log -- --all                 ログを全部
//   npm run log -- "やったこと・分かったこと"     ログに1行メモ
//   npm run log -- todo  "…"             ステップに載らない小さなやること
//   npm run log -- wait  "back-a に #14（件数を足す）"   誰に何を頼んで待っているか
//   npm run log -- stuck "画面が真っ白" --scope 内 --tried "shot・console" --why 知識 --next "11:30 で blocked"
//                                         行き詰まり。--scope 内|外(担当者)、--why 権限|契約不足|知識|外部|時間。30分を超えると npm run now が知らせる
//   npm run log -- q     "一覧は10件で切るか"       自分だけの未決の問い（人に関わるものは open.md か Issue へ）
//   npm run log -- done  "<項目の一部>"      やること・待ち・行き詰まり・未決を解決済みにする
//   npm run log -- decide "ボタンは1画面1つ（UX の約束）"   決めたことと理由
//   npm run log -- ai    "375px で撮って比べてと頼むと崩れに気づく"   AI の効いた頼み方・間違い
//   npm run log -- gh    "…"             GitHub に書く内容の下書き（長い本文はエディタで。投稿は npm run issue -- … --body-file）
//   npm run log -- open                  ファイルをエディタで開く（人向け）
// 開始（npm run step）・完了（npm run merge。かかった分も）は自動で書かれる。
import { spawn } from "node:child_process";
import { currentMember } from "./lib/kit.mjs";
import { addEntry, closeEntry, logFile, readLog, SECTIONS, stamp, summary, WHY } from "./lib/log.mjs";

const me = currentMember();
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
if (!me) fail("自分が未設定。npm run kit:whoami -- <id>");

const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const [first, ...rest] = positional;
const wrote = (f) => {
  if (!f) fail("書けなかった（KIT_LOG_DIR で置き場所を変えられる）");
  console.log(`✓ ${f}`);
};

if (first === "open") {
  readLog(me) ?? addEntry(me, "log", "ファイルを作った");
  const f = logFile(me.id);
  const [cmd, cmdArgs] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", f]]
      : [process.platform === "darwin" ? "open" : "xdg-open", [f]];
  spawn(cmd, cmdArgs, { detached: true, stdio: "ignore" }).unref();
  console.log(f);
} else if (first === "done") {
  if (!rest.length) fail('使い方: npm run log -- done "<項目の一部>"');
  const line = closeEntry(me, rest.join(" "));
  if (!line) fail(`開いている項目に「${rest.join(" ")}」がない（npm run log -- open で確かめる）`);
  console.log(`✓ 解決: ${line}`);
} else if (first && first in SECTIONS && first !== "log") {
  let text = rest.join(" ");
  if (!text) fail(`使い方: npm run log -- ${first} "1行"`);
  if (first === "stuck") {
    const why = opt("--why");
    if (why && !WHY.includes(why)) console.log(`! --why は ${WHY.join(" / ")} のどれか（そのまま書いた）`);
    const parts = [
      opt("--scope") && `範囲: ${opt("--scope")}`,
      opt("--tried") && `試した: ${opt("--tried")}`,
      why && `理由: ${why}`,
      opt("--next") && `次: ${opt("--next")}`,
    ].filter(Boolean);
    if (parts.length) text = `${text} ／ ${parts.join(" ／ ")}`;
    if (opt("--scope")?.startsWith("外"))
      console.log("! 範囲の外 → 担当者に npm run issue -- bug|task <担当者> …（自分で直さない）");
  }
  wrote(addEntry(me, first, text));
} else if (positional.length) {
  wrote(addEntry(me, "log", positional.join(" ")));
} else {
  const all = readLog(me);
  if (!all) {
    console.log(`まだない（${logFile(me.id)}）。npm run step / merge で自動で書かれる。メモは npm run log -- "…"`);
    process.exit(0);
  }
  const today = `${stamp().split(" ")[0]} `;
  const head = all.indexOf(`## ${SECTIONS.log.title.split("（")[0]}`);
  const lines = all
    .slice(head)
    .split("\n")
    .filter((l) => l.startsWith("- "));
  const shown = args.includes("--all") ? lines : lines.filter((l) => l.startsWith(`- ${today}`));
  console.log(`${logFile(me.id)}（ログ ${args.includes("--all") ? "全部" : "今日"} ${shown.length} 件）`);
  console.log(shown.join("\n") || "（今日はまだない）");
  const s = summary(me);
  if (s) console.log(`開いている: やること ${s.todo} / 待ち ${s.wait} / 行き詰まり ${s.stuck}`);
}
