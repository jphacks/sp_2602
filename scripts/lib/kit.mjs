// 共通ヘルパ: 設定の読み込み・所有者判定・git 呼び出し。依存パッケージなしで動かす。

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const p = (...xs) => resolve(ROOT, ...xs);

export function loadConfig() {
  return JSON.parse(readFileSync(p("kit.config.json"), "utf8"));
}

// "**" は階層をまたぐ、"*" は1階層内。
export function globToRegex(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export const matches = (file, globs) => globs.some((g) => globToRegex(g).test(file));

// ファイルの所有者 id を返す。貸し出し中（kit.config.json の loans。npm run handoff）なら借りている人、
// 共有ファイルは "shared"、誰のものでもなければ null。
export function ownerOf(file, cfg = loadConfig()) {
  const f = file.replace(/\\/g, "/");
  const loan = (cfg.loans ?? []).find((l) => l.files?.includes(f));
  if (loan) return loan.to;
  return baseOwnerOf(f, cfg);
}

// 貸し出しを見ない、owns どおりの持ち主
export function baseOwnerOf(file, cfg = loadConfig()) {
  const f = file.replace(/\\/g, "/");
  for (const m of cfg.members) if (matches(f, m.owns)) return m.id;
  if (matches(f, cfg.shared ?? [])) return "shared";
  return null;
}

// me がその持ち主（ownerOf の結果）のファイルを触ってよいか。自分のもの・共有に加えて、
// editAll: true の人（kit.config.json の members。全員の範囲で不具合を見るデバッガー）は、持ち主のいるファイルならどれでも触れる
export const mayEdit = (owner, me, cfg) =>
  owner === me.id || owner === "shared" || (me.editAll === true && cfg.members.some((m) => m.id === owner));

// 貸し出し（loans の1件）として通らない理由を返す。通るなら null。by = 貸す操作をする人の id。
// npm run handoff（書く前）と npm run scope（コミットされた kit.config.json の検査）の両方で同じ判定を使う
export function loanProblem(loan, cfg, by) {
  const lead = cfg.members[0].id;
  if (!Number.isInteger(loan.issue) || loan.issue <= 0) return "issue は help Issue の番号（正の整数）";
  if (Number.isNaN(Date.parse(loan.at ?? ""))) return "at（貸した時刻）がない";
  if (!cfg.members.some((m) => m.id === loan.to)) return `借りる人 ${loan.to} は members にない`;
  if (!Array.isArray(loan.files) || !loan.files.length) return "files が空";
  for (const f of loan.files) {
    if (typeof f !== "string" || /[*?]/.test(f)) return `${f}: ファイルは1つずつ名前で書く（* は使えない）`;
    if (f.startsWith("/") || f.split("/").includes("..") || /^[A-Za-z]:/.test(f))
      return `${f}: リポジトリ内の相対パスで書く`;
    if (f.startsWith("contracts/") || f === "kit.config.json")
      return `${f}: 契約と kit.config.json は貸せない（lead だけが変える）`;
    const owner = baseOwnerOf(f, cfg);
    if (owner !== loan.from) return `${f}: 持ち主は ${owner ?? "なし"}（from の ${loan.from} ではない）`;
    if ((cfg.loans ?? []).some((l) => l !== loan && l.files?.includes(f))) return `${f}: すでに貸し出し中`;
  }
  if (loan.to === loan.from) return "自分に貸すことはできない";
  if (![loan.from, cfg.facilitator, lead].includes(by))
    return `貸せるのは持ち主（${loan.from}）・まとめ役・${lead} だけ`;
  return null;
}

// 貸し出しの期限: 貸した後の最初の同期点（合流と同じ。docs/rules/help.md）。同期点がもうなければ null
export const loanDue = (cfg, loan) => cfg.milestones.find((m) => m.sync && new Date(m.at) > new Date(loan.at)) ?? null;

// 自分が誰か: 環境変数 KIT_MEMBER → .kit-member ファイル（git 管理外）。
export function currentMember(cfg = loadConfig()) {
  let id = process.env.KIT_MEMBER?.trim();
  if (!id && existsSync(p(".kit-member"))) id = readFileSync(p(".kit-member"), "utf8").trim();
  if (!id) return null;
  return cfg.members.find((m) => m.id === id) ?? null;
}

export function sh(cmd, { allowFail = false } = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    if (allowFail) return null;
    throw e;
  }
}

// 今の時刻。リハーサル・試験用に、KIT_NOW（例: 2026-10-17T18:20:00+09:00）で「起動した瞬間の時刻」を決められる（そこから時計は進む）。
// KIT_CLOCK_SPEED（例: 60）を足すと、その倍の速さで進む（60 なら実際の1秒が1分）
const clockStart = Date.now();
const clockBase = process.env.KIT_NOW ? Date.parse(process.env.KIT_NOW) : clockStart;
export const clockSpeed = Number(process.env.KIT_CLOCK_SPEED) > 0 ? Number(process.env.KIT_CLOCK_SPEED) : 1;
export const clock = () => new Date(clockBase + (Date.now() - clockStart) * clockSpeed);

// gh を呼んで JSON を返す。使えない（未認証・ネットワーク・remote なし）なら null
export function ghJson(args) {
  const r = sh(`gh ${args}`, { allowFail: true });
  try {
    return r ? JSON.parse(r) : null;
  } catch {
    return null;
  }
}

// 同じ GitHub アカウントを複数人で使っているか（リハーサル等）。その場合 Issue の宛先は member:<id> ラベル、PR はブランチ名の先頭で見分ける
export const sharesAccount = (cfg, member) =>
  cfg.members.filter((m) => m.github.toLowerCase() === member.github.toLowerCase()).length > 1;

export function phaseAt(cfg, now = clock()) {
  const ms = [...cfg.milestones].sort((a, b) => new Date(a.at) - new Date(b.at));
  let current = null;
  let next = null;
  for (const m of ms) {
    if (new Date(m.at) <= now) current = m;
    else if (!next) next = m;
  }
  return { current, next, ms };
}

// ステップの状態。完了は「マージ済み PR のブランチ名 <id>/S<番号>-…」から自動で判定する（手で印は付けない）。
// gh が使えないときは、手元の main のマージコミットの件名から判定する。ただし npm run merge はスカッシュマージ（件名にブランチ名が残らない）なので、
// remote がある時のこの判定は「完了」を見落とす。そのことを source に出す。
//   返り値: { steps: [{ id, text, state: "done" | "pr" | "wip" | "todo", pr? }], next } / メンバーファイルがなければ null
//   wip = 下書きの PR（npm run declare が作る）で作業中。pr = 下書きでない PR がマージ待ち
export function stepStates(me) {
  const file = p(`docs/members/${me.id}.md`);
  if (!existsSync(file)) return null;
  const steps = readFileSync(file, "utf8")
    .split("\n")
    .map((l) => /^- (?:\[[ x]\] )?(S\d+)\b\s*(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ id: m[1], text: m[2].trim(), state: "todo" }));

  const merged = new Set();
  const open = new Map();
  const branchStep = new RegExp(`(?:^|[/'\\s])${me.id}/(S\\d+)(?:\\b|-)`);
  const hasRemote = !!sh("git remote get-url origin", { allowFail: true });
  let prs = null;
  if (hasRemote) {
    try {
      prs = JSON.parse(
        sh("gh pr list --state all --limit 300 --json number,headRefName,state,isDraft", { allowFail: true }) ?? "null",
      );
    } catch {}
  }
  if (prs) {
    for (const pr of prs) {
      const m = branchStep.exec(pr.headRefName);
      if (!m) continue;
      if (pr.state === "MERGED") merged.add(m[1]);
      else if (pr.state === "OPEN") open.set(m[1], pr);
    }
  } else {
    const log = sh(`git log ${hasRemote ? "origin/main" : "main"} --merges --format=%s`, { allowFail: true }) ?? "";
    for (const subject of log.split("\n")) {
      const m = branchStep.exec(subject);
      if (m) merged.add(m[1]);
    }
  }
  for (const s of steps) {
    if (merged.has(s.id)) s.state = "done";
    else if (open.has(s.id)) {
      s.state = open.get(s.id).isDraft ? "wip" : "pr";
      s.pr = open.get(s.id).number;
    }
  }
  const source = prs
    ? "GitHub の PR"
    : hasRemote
      ? "手元の main。gh が使えず、スカッシュマージした PR は完了と判定できない → gh を直して npm run now をやり直す"
      : "手元の main";
  return { steps, next: steps.find((s) => s.state === "todo") ?? null, source };
}

// 合流の時間帯（docs/rules/help.md）。区切りは kit.config.json の help と、最初の frozen の milestone から決まる。
//   carve  : 切り出し型の合流もしてよい
//   verify : 確認・テストの手伝いだけ（新しいコードを増やさない）
//   all    : フリーズ後。全員がデモの不具合修正・通し練習
export function helpPhase(cfg, now = clock()) {
  const { ms } = phaseAt(cfg, now);
  const freeze = ms.find((m) => m.changes === "frozen");
  const nextSync = ms.find((m) => m.sync && new Date(m.at) > now) ?? null;
  if (!freeze) return { mode: "carve", text: "切り出し型の合流もしてよい（フリーズ未設定）", nextSync };
  const cutoffMin = cfg.help?.carveOutCutoffMinBeforeFreeze ?? 90;
  const cutoff = new Date(new Date(freeze.at).getTime() - cutoffMin * 60000);
  if (now >= new Date(freeze.at))
    return { mode: "all", text: "フリーズ後: 全員がデモの不具合修正と通し練習", nextSync };
  if (now >= cutoff)
    return { mode: "verify", text: "確認・テストの手伝いだけ（新しいコードを増やす合流はしない）", nextSync };
  return { mode: "carve", text: `切り出し型の合流もしてよい（${fmtTime(cutoff.toISOString())} まで）`, nextSync };
}

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
