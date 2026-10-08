// npm run doctor — このPCで開発できる状態かを確かめる。前日までに全員が通す。
//   --quick : 起動確認を省く

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { currentMember, loadConfig, p, sh } from "./lib/kit.mjs";

const quick = process.argv.includes("--quick");
const cfg = loadConfig();
const results = [];
const check = (name, ok, hint = "") => results.push({ name, ok, hint });

// Node のバージョン
const want = Number(readFileSync(p(".nvmrc"), "utf8").trim().replace(/^v/, "").split(".")[0]);
const have = Number(process.versions.node.split(".")[0]);
check(`Node ${want} 系`, have === want, `今は ${process.versions.node}。.nvmrc に合わせる`);

// 依存が lockfile 通りに入っているか
check("package-lock.json がある", existsSync(p("package-lock.json")), "lead が npm install して commit する");
const ls = sh("npm ls --depth=0", { allowFail: true });
check("依存がインストール済み（lockfile 通り）", ls !== null, "npm ci を実行");

// .env
if (existsSync(p(".env.example"))) {
  // .env.example で値が空のキーは「本物を呼ぶときだけ必要」。MOCK=1 なら警告にとどめる。
  const lines = readFileSync(p(".env.example"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[A-Z_]+=/.test(l));
  const env = existsSync(p(".env")) ? readFileSync(p(".env"), "utf8") : "";
  const has = (k) => new RegExp(`^${k}=.+`, "m").test(env);
  const required = lines.filter((l) => !l.endsWith("=")).map((l) => l.split("=")[0]);
  const live = lines.filter((l) => l.endsWith("=")).map((l) => l.split("=")[0]);
  const missing = required.filter((k) => !has(k));
  check(
    ".env がある",
    existsSync(p(".env")) && missing.length === 0,
    missing.length ? `足りない: ${missing.join(", ")}` : "cp .env.example .env",
  );
  const liveMissing = live.filter((k) => !has(k));
  if (liveMissing.length) {
    if (/^MOCK=1/m.test(env))
      console.log(`! 本物の呼び出し用のキーが空（MOCK=1 なので開発は可）: ${liveMissing.join(", ")}`);
    else
      check(
        "本物の呼び出し用のキーがある",
        false,
        `足りない: ${liveMissing.join(", ")}（モックで開発するなら MOCK=1）`,
      );
  }
}

// git まわり
check("自分が設定済み", !!currentMember(cfg), "npm run kit:whoami -- <id>");
check("git hooks が有効", sh("git config core.hooksPath", { allowFail: true }) === ".githooks", "npm run kit:setup");
// gh auth status は保存済みの認証の不調も失敗扱いにするので、実際に API が使えるかで判定する（GH_TOKEN でも可）
check(
  "gh で GitHub を使える",
  sh("gh api user --jq .login", { allowFail: true }) !== null,
  "gh auth login（または GH_TOKEN を設定）",
);

// 型チェック
check("型チェックが通る", sh("npx tsc --noEmit", { allowFail: true }) !== null, "npm run typecheck で詳細");

// 起動確認: モックでサーバを立て /api/health を叩く
async function smoke() {
  const port = cfg.ports.app + 7; // 開発中のサーバとぶつけない
  // 開発中の npm run dev とぶつからないよう、別の出力先（.next-doctor）で起動する
  const child = spawn(process.execPath, [p("node_modules/next/dist/bin/next"), "dev", "-p", String(port)], {
    cwd: p(""),
    env: { ...process.env, MOCK: "1", NEXT_DIST_DIR: ".next-doctor" },
    stdio: "ignore",
  });
  let ok = false;
  for (let i = 0; i < 120 && !ok; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      ok = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok;
    } catch {}
  }
  // Next は子プロセスを作るので、プロセスツリーごと止める
  if (process.platform === "win32") sh(`taskkill /pid ${child.pid} /T /F`, { allowFail: true });
  else child.kill("SIGTERM");
  check("モックで Next.js が起動し /api/health が応答する", ok, "MOCK=1 npm run dev でエラーを見る");
}
if (!quick) await smoke();

let allOk = true;
for (const r of results) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `  → ${r.hint}`}`);
  if (!r.ok) allOk = false;
}
if (allOk) {
  const sp = p(".kit-state.json");
  const state = existsSync(sp) ? JSON.parse(readFileSync(sp, "utf8")) : {};
  state.doctorOkAt = new Date().toISOString();
  writeFileSync(sp, JSON.stringify(state, null, 2));
  console.log("\nすべて OK");
}
process.exit(allOk ? 0 : 1);
