// 個人の作業ファイル（リポジトリの外に置く。公開リポジトリに個人のメモを出さないため）。
// 置き場所: KIT_LOG_DIR（なければ Windows は C:\hackathon\log、それ以外は ~/hackathon/log）/<リポジトリのフォルダ名>/<自分のid>.md
// AI はこのファイルを読まない（トークンを使わない）。書くのは npm run log -- <種類> "1行" だけ。人はエディタで開いて直してもよい。
// 書けなくても step / merge / now を止めない（失敗したら黙って諦める）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { ROOT } from "./kit.mjs";

// 種類 → 見出し。check: true は「- [ ]」で始まり、npm run log -- done で閉じる
export const SECTIONS = {
  todo: { title: "やること（ステップに載らない小さなもの）", check: true },
  wait: { title: "待ち（誰に何を頼んで待っているか）", check: true },
  stuck: { title: "行き詰まり（範囲 内/外 ／ 試したこと ／ 解決できない理由 ／ 次の手）", check: true },
  q: { title: "未決・解決済み（自分だけの問い。人に関わるものは open.md か Issue へ）", check: true },
  decide: { title: "決めたこと（理由）", check: false },
  gh: { title: "GitHub の下書き（→ npm run issue -- … --body-file）", check: false },
  ai: { title: "AI メモ（効いた頼み方・AI の間違い）", check: false },
  log: { title: "ログ（開始・完了は自動）", check: false },
};
export const WHY = ["権限", "契約不足", "知識", "外部", "時間"];

export function logDir() {
  const base =
    process.env.KIT_LOG_DIR ||
    (process.platform === "win32" ? "C:\\hackathon\\log" : join(homedir(), "hackathon", "log"));
  return join(base, basename(ROOT));
}
export const logFile = (id) => join(logDir(), `${id}.md`);

const pad = (n) => String(n).padStart(2, "0");
export const stamp = (d = new Date()) =>
  `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
// "10/18 10:05" → Date（年は今年）
export function parseStamp(s) {
  const m = /(\d{1,2})\/(\d{1,2}) (\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(new Date().getFullYear(), Number(m[1]) - 1, Number(m[2]), Number(m[3]), Number(m[4]));
}
const oneLine = (t) =>
  String(t)
    .replace(/\s*\n\s*/g, " ")
    .trim();

function template(member) {
  const head = `# ${member.id}（${member.github}）— ${member.role}\n今: （npm run step で更新）\n`;
  return `${head}\n${Object.values(SECTIONS)
    .map((s) => `## ${s.title}\n`)
    .join("\n")}`;
}

function load(member) {
  const f = logFile(member.id);
  if (!existsSync(f)) {
    mkdirSync(logDir(), { recursive: true });
    writeFileSync(f, template(member));
  }
  return readFileSync(f, "utf8");
}

// 見出しの範囲の最後に1行足す。見出しがなければ末尾に作る
function insert(text, kind, line) {
  const title = `## ${SECTIONS[kind].title}`;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let at = lines.findIndex((l) => l.startsWith(`## ${SECTIONS[kind].title.split("（")[0]}`));
  if (at < 0) {
    if (lines[lines.length - 1] !== "") lines.push("");
    lines.push(title);
    at = lines.length - 1;
  }
  let end = at + 1;
  while (end < lines.length && !lines[end].startsWith("## ")) end++;
  let last = end;
  while (last > at + 1 && lines[last - 1].trim() === "") last--;
  lines.splice(last, 0, line);
  return lines.join("\n");
}

// kind の見出しに1行足す。ログ以外は「ログ」にも1行残す（いつ何を書いたかが1か所で追える）
export function addEntry(member, kind, text) {
  try {
    const t = oneLine(text);
    const now = stamp();
    let s = load(member);
    if (kind === "log") s = insert(s, "log", `- ${now} [メモ] ${t}`);
    else {
      s = insert(s, kind, SECTIONS[kind].check ? `- [ ] ${now} ${t}` : `- ${now} ${t}`);
      if (SECTIONS[kind].check) s = insert(s, "log", `- ${now} [${SECTIONS[kind].title.split("（")[0]}] ${t}`);
    }
    writeFileSync(logFile(member.id), s);
    return logFile(member.id);
  } catch {
    return null;
  }
}

// 自動の記録（開始・完了など）。ログの見出しに足す
export function appendLog(member, kind, text) {
  try {
    const s = insert(load(member), "log", `- ${stamp()} [${kind}] ${oneLine(text)}`);
    writeFileSync(logFile(member.id), s);
    return logFile(member.id);
  } catch {
    return null;
  }
}

// 2行目の「今: …」を書き換える
export function setNow(member, text) {
  try {
    const s = load(member)
      .split("\n")
      .map((l, i) => (i === 1 && l.startsWith("今:") ? `今: ${oneLine(text)}` : l))
      .join("\n");
    writeFileSync(logFile(member.id), s);
  } catch {}
}

// 「- [ ]」の項目のうち、word を含む最初の1つを閉じる
export function closeEntry(member, word) {
  try {
    const lines = load(member).split("\n");
    const i = lines.findIndex((l) => l.startsWith("- [ ] ") && l.includes(word));
    if (i < 0) return null;
    lines[i] = `${lines[i].replace("- [ ] ", "- [x] ")} → 解決 ${stamp().split(" ")[1]}`;
    writeFileSync(logFile(member.id), lines.join("\n"));
    appendLog(member, "解決", lines[i].replace(/^- \[x\] \S+ \S+ /, ""));
    return lines[i];
  } catch {
    return null;
  }
}

// 「開始 … （<branch>）」から完了までの分数。見つからなければ null
export function minutesSinceStart(member, branch) {
  try {
    const line = readFileSync(logFile(member.id), "utf8")
      .split("\n")
      .filter((l) => l.includes("[開始]") && l.includes(`（${branch}）`))
      .pop();
    const t = line && parseStamp(line);
    return t ? Math.round((Date.now() - t.getTime()) / 60000) : null;
  } catch {
    return null;
  }
}

// npm run now 用の要約（ファイルの中身は出さない。件数と30分を超えた行き詰まりだけ）
export function summary(member) {
  try {
    const f = logFile(member.id);
    if (!existsSync(f)) return null;
    const lines = readFileSync(f, "utf8").split("\n");
    const open = (kind) => {
      const head = lines.findIndex((l) => l.startsWith(`## ${SECTIONS[kind].title.split("（")[0]}`));
      if (head < 0) return [];
      const out = [];
      for (let i = head + 1; i < lines.length && !lines[i].startsWith("## "); i++)
        if (lines[i].startsWith("- [ ] ")) out.push(lines[i]);
      return out;
    };
    const stuck = open("stuck");
    const over = stuck.filter((l) => {
      const t = parseStamp(l);
      return t && Date.now() - t.getTime() > 30 * 60000;
    });
    return { file: f, wait: open("wait").length, stuck: stuck.length, todo: open("todo").length, over };
  } catch {
    return null;
  }
}

export function readLog(member) {
  try {
    return readFileSync(logFile(member.id), "utf8");
  } catch {
    return null;
  }
}
