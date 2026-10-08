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

// ファイルの所有者 id を返す。共有ファイルは "shared"、誰のものでもなければ null。
export function ownerOf(file, cfg = loadConfig()) {
  const f = file.replace(/\\/g, "/");
  for (const m of cfg.members) if (matches(f, m.owns)) return m.id;
  if (matches(f, cfg.shared ?? [])) return "shared";
  return null;
}

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

export function phaseAt(cfg, now = new Date()) {
  const ms = [...cfg.milestones].sort((a, b) => new Date(a.at) - new Date(b.at));
  let current = null;
  let next = null;
  for (const m of ms) {
    if (new Date(m.at) <= now) current = m;
    else if (!next) next = m;
  }
  return { current, next, ms };
}

// 合流の時間帯（docs/rules/help.md）。区切りは kit.config.json の help と、最初の frozen の milestone から決まる。
//   carve  : 切り出し型の合流もしてよい
//   verify : 確認・テストの手伝いだけ（新しいコードを増やさない）
//   all    : フリーズ後。全員がデモの不具合修正・通し練習
export function helpPhase(cfg, now = new Date()) {
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
