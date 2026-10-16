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
check("型チェックが通る", sh("npm run -s typecheck", { allowFail: true }) !== null, "npm run typecheck で詳細");

// Android の開発環境（Kotlin のビルドと実機・エミュレータでの確認に要る。入れるのは人間の作業: docs/kit/setup.md）
const javaVer = (sh("java -version 2>&1", { allowFail: true }) ?? "").match(/version "(\d+)/)?.[1];
check(
  "Java 17 以上（Android のビルドに要る）",
  Number(javaVer) >= 17,
  "Android Studio に付いてくる JDK、または JDK 17 を入れる",
);
// 環境変数が未設定でも、Android Studio の標準の場所にあれば使う（見つかったが環境変数が無いときは設定を案内）
const sdkDefaults = [
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Android/Sdk`,
  process.env.HOME && `${process.env.HOME}/Library/Android/sdk`,
  process.env.HOME && `${process.env.HOME}/Android/Sdk`,
].filter(Boolean);
const sdkEnv = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const sdk = sdkEnv && existsSync(sdkEnv) ? sdkEnv : sdkDefaults.find((d) => existsSync(d));
check(
  "ANDROID_HOME が Android SDK を指している",
  !!sdkEnv && existsSync(sdkEnv),
  sdk
    ? `SDK は ${sdk} にある。環境変数 ANDROID_HOME にこの場所を設定する`
    : "Android Studio をインストールし、起動して SDK を入れ、その場所を ANDROID_HOME に設定する（docs/kit/setup.md）",
);
const adbPath = process.env.ADB ?? (sdk ? `${sdk}/platform-tools/adb` : "adb");
check(
  "adb が動く（端末とやりとりする道具）",
  sh(`"${adbPath}" version`, { allowFail: true }) !== null,
  "Android Studio の SDK Manager で「Android SDK Platform-Tools」を入れ、ANDROID_HOME/platform-tools を確かめる",
);
// 端末は、準備の時点でなくてもよい（画面を確かめるときに要る）ので、警告にとどめる
const lines = (sh(`"${adbPath}" devices`, { allowFail: true }) ?? "").split("\n").slice(1);
const devices = lines.filter((l) => /\tdevice\s*$/.test(l)).map((l) => l.split("\t")[0]);
if (lines.some((l) => /\tunauthorized\s*$/.test(l)))
  console.log("! 端末が「未許可」。端末の画面に出る「USBデバッグを許可しますか」で許可する");
if (!devices.length) {
  console.log(
    "! つながっている端末がない（画面の確認 npm run shot・npm run android に要る）。実機は、設定で開発者向けオプションと USB デバッグをオンにして USB でつなぐ。エミュレータなら Android Studio から起動する",
  );
} else {
  for (const d of devices) {
    const ver = (sh(`"${adbPath}" -s ${d} shell getprop ro.build.version.release`, { allowFail: true }) ?? "").trim();
    console.log(
      ver === "16"
        ? `✓ 端末 ${d}（Android ${ver}）につながっている`
        : `! 端末 ${d} は Android ${ver || "不明"}。実機の確認先は Android 16 の想定`,
    );
  }
}

// 起動確認: モックでサーバ（Hono）を立て /api/health を叩く
async function smoke() {
  const port = cfg.ports.app + 7; // 開発中の npm run dev:server とぶつけない
  const child = spawn(process.execPath, [p("node_modules/tsx/dist/cli.mjs"), p("src/server/dev.ts")], {
    cwd: p(""),
    env: { ...process.env, MOCK: "1", PORT: String(port) },
    stdio: "ignore",
  });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      ok = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok;
    } catch {}
  }
  if (process.platform === "win32") sh(`taskkill /pid ${child.pid} /T /F`, { allowFail: true });
  else child.kill("SIGTERM");
  check("モックでサーバ（Hono）が起動し /api/health が応答する", ok, "MOCK=1 npm run dev:server でエラーを見る");
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
