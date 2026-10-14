// 個人の作業ログ（リポジトリの外に置く。公開リポジトリに個人のメモを出さないため）。
// 置き場所: KIT_LOG_DIR（なければ Windows は C:\hackathon\log、それ以外は ~/hackathon/log）/<リポジトリのフォルダ名>/<自分のid>.md
// ログの失敗で step / merge を止めない（書けなければ黙って諦める）。
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { ROOT } from "./kit.mjs";

export function logDir() {
  const base =
    process.env.KIT_LOG_DIR ||
    (process.platform === "win32" ? "C:\\hackathon\\log" : join(homedir(), "hackathon", "log"));
  return join(base, basename(ROOT));
}

export const logFile = (id) => join(logDir(), `${id}.md`);

const stamp = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// kind: 開始 / 完了 / メモ。text は1行（改行は空白にする）
export function appendLog(id, kind, text) {
  try {
    const f = logFile(id);
    mkdirSync(logDir(), { recursive: true });
    if (!existsSync(f)) appendFileSync(f, `# ${id} の作業ログ（${basename(ROOT)}）\n\n`);
    appendFileSync(
      f,
      `- ${stamp()} [${kind}] ${String(text)
        .replace(/\s*\n\s*/g, " ")
        .trim()}\n`,
    );
    return f;
  } catch {
    return null;
  }
}

export function readLog(id) {
  try {
    return readFileSync(logFile(id), "utf8");
  } catch {
    return null;
  }
}
