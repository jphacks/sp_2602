// npm run shot -- <URL> <保存先.png> [--size 375x812] [--wait 1500] [--js "document.querySelector('button').click()"] [--after 1500] [--profile s1]
// 画面のスクリーンショット。AI が自分の画面を「目で」確かめるための道具（依存なし。Edge / Chrome のヘッドレスを DevTools プロトコルで操作）。
//   --js は読み込み後にページ内で実行する（ボタンを押すなど）。--after はその後に待つミリ秒。
//   --profile <名前> は同じブラウザの保存領域を使い回す（同じ利用者として開き直す。押した本人の画面を撮るときなど）。
// 撮った画像は Read ツールで開き、デザインと見比べる。保存先は docs/shots/<自分のid>/<D番号>-<名前>.png を推奨（共有ファイル）。
// ブラウザは KIT_BROWSER（実行ファイルのパス）か、よくある場所の Edge / Chrome を使う。
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const [url, out, ...rest] = process.argv.slice(2);
if (!url || !out) {
  console.error(
    "使い方: npm run shot -- <URL> <保存先.png> [--size 375x812] [--wait ms] [--js code] [--after ms] [--profile 名前]",
  );
  process.exit(2);
}
const opt = (k, d) => {
  const i = rest.indexOf(k);
  return i < 0 ? d : rest[i + 1];
};
const [w, h] = opt("--size", "375x812").split("x").map(Number);
const wait = Number(opt("--wait", "1500"));
const js = opt("--js");
const after = Number(opt("--after", "1500"));
const profile = opt("--profile");
const CANDIDATES = [
  process.env.KIT_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const BROWSER = CANDIDATES.find((c) => existsSync(c));
if (!BROWSER) {
  console.error("✗ Edge / Chrome が見つからない。KIT_BROWSER にブラウザの実行ファイルのパスを入れる");
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = profile ? join(tmpdir(), `shot-profile-${profile}`) : mkdtempSync(join(tmpdir(), "shot-"));
const portFile = join(dir, "DevToolsActivePort");
if (existsSync(portFile)) rmSync(portFile);
const edge = spawn(
  BROWSER,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${dir}`,
    `--window-size=${w},${h}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

// Windows では kill() でも taskkill /T でも Edge が残る（起動したプロセスがすぐ抜け、子が残る）。
// 残ったページは動き続ける（同期点1で参加数が水増しされた）。DevTools の Browser.close で閉じ、念のため保存領域の名前で探して落とす
let browserWs;
async function stopEdge() {
  try {
    if (browserWs) {
      const bws = new WebSocket(browserWs);
      await new Promise((r, j) => {
        bws.addEventListener("open", r, { once: true });
        bws.addEventListener("error", j, { once: true });
      });
      bws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
      await sleep(800);
    }
  } catch {}
  try {
    if (process.platform === "win32") {
      const key = dir.replaceAll("'", "''");
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${key}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
        ],
        { stdio: "ignore" },
      );
    } else edge.kill();
  } catch {}
}

let ws;
try {
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    if (existsSync(portFile)) port = readFileSync(portFile, "utf8").split("\n")[0].trim();
    else await sleep(100);
  }
  if (!port) throw new Error("Edge が起動しなかった");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  browserWs = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
  ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const cdp = (method, params = {}) =>
    new Promise((r) => {
      const n = ++id;
      pending.set(n, r);
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  await cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await cdp("Page.navigate", { url });
  await sleep(wait);
  if (js) {
    const r = await cdp("Runtime.evaluate", { expression: js, awaitPromise: true });
    if (r.result?.exceptionDetails) console.error("js のエラー:", r.result.exceptionDetails.text);
    await sleep(after);
  }
  const shot = await cdp("Page.captureScreenshot", { format: "png" });
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), Buffer.from(shot.result.data, "base64"));
  console.log(`保存: ${resolve(out)}（${w}x${h}）`);
} finally {
  ws?.close();
  await stopEdge();
  await sleep(500);
  if (!profile)
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
}
