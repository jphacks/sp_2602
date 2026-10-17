// npm run shot -- <保存先.png> [--link hackathonkit://role] [--wait 1500] [--tap x,y] [--after 1000] [--serial emulator-5554]
// Android の画面のスクリーンショット。AI が自分の画面を「目で」確かめるための道具（依存なし。adb で、つながっている実機かエミュレータの画面を撮る）。
//   --link  は撮る前に開く画面（アプリの deep link。app.json の scheme + 画面 id、例 hackathonkit://role）。なければ今映っている画面を撮る
//   --wait  は --link で開いたあとに待つミリ秒（画面が描かれるまで）。--tap x,y は撮る前にその位置（画面の dp ではなく px）を押す、--after は押したあとに待つミリ秒
//   --serial は端末が複数つながっているとき、どれを撮るか（adb devices の1列目）
// 撮った画像は Read ツールで開き、デザインと見比べる。保存先は docs/shots/<自分のid>/<D番号>-<名前>.png を推奨（共有ファイル）。
// adb は ADB（実行ファイルのパス）か、ANDROID_HOME の platform-tools か、PATH のものを使う。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const [out, ...rest] = process.argv.slice(2);
if (!out || out.startsWith("--")) {
  console.error(
    "使い方: npm run shot -- <保存先.png> [--link hackathonkit://role] [--wait ms] [--tap x,y] [--after ms] [--serial id]",
  );
  process.exit(2);
}
const opt = (k, d) => {
  const i = rest.indexOf(k);
  return i < 0 ? d : rest[i + 1];
};
const link = opt("--link");
const wait = Number(opt("--wait", "2000"));
const tap = opt("--tap");
const after = Number(opt("--after", "1000"));
const serial = opt("--serial");

const exe = process.platform === "win32" ? "adb.exe" : "adb";
// doctor と同じ探し方: ADB → ANDROID_HOME / ANDROID_SDK_ROOT → Android Studio の標準の場所 → PATH
const adb =
  process.env.ADB ??
  [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Android/Sdk`,
    process.env.HOME && `${process.env.HOME}/Library/Android/sdk`,
    process.env.HOME && `${process.env.HOME}/Android/Sdk`,
  ]
    .filter(Boolean)
    .map((h) => join(h, "platform-tools", exe))
    .find((f) => existsSync(f)) ??
  exe;
const run = (args, o = {}) =>
  execFileSync(adb, [...(serial ? ["-s", serial] : []), ...args], { maxBuffer: 64 * 1024 * 1024, ...o });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

let lines;
try {
  lines = execFileSync(adb, ["devices"], { encoding: "utf8" }).split("\n").slice(1);
} catch {
  fail(
    "adb（端末とやりとりする道具）が見つからないか、動かない。Android Studio の SDK Manager で「Android SDK Platform-Tools」を入れ、環境変数 ANDROID_HOME に SDK の場所を設定する（docs/kit/setup.md。人間の作業）。確かめるには npm run doctor",
  );
}
const unauthorized = lines.filter((l) => /\tunauthorized\s*$/.test(l));
const offline = lines.filter((l) => /\toffline\s*$/.test(l));
const devices = lines.filter((l) => /\tdevice\s*$/.test(l));
if (!devices.length) {
  if (unauthorized.length)
    fail(
      "端末は見えているが、USB デバッグが許可されていない。端末の画面に出る「USB デバッグを許可しますか」で許可してから、もう一度実行する",
    );
  if (offline.length)
    fail("端末が応答しない（offline）。USB を抜き差しするか、エミュレータを再起動してから、もう一度実行する");
  fail(
    "つながっている端末がない。実機は、設定で開発者向けオプションと USB デバッグをオンにして USB でつなぐ。エミュレータなら Android Studio の Device Manager から起動する。そのあと、もう一度実行する",
  );
}
if (devices.length > 1 && !serial)
  fail(
    `端末が複数ある。どれを撮るかを --serial で選んで、もう一度実行する（候補: ${devices.map((l) => l.split("\t")[0]).join(", ")}）`,
  );

if (link) {
  try {
    run(["shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", link]);
  } catch (e) {
    fail(`${link} を開けなかった（アプリが入っているか、scheme が合っているか）: ${e.message.split("\n")[0]}`);
  }
  await sleep(wait);
}
if (tap) {
  const [x, y] = tap.split(",").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) fail("--tap は x,y（例 540,1200）");
  run(["shell", "input", "tap", String(x), String(y)]);
  await sleep(after);
}

const png = run(["exec-out", "screencap", "-p"]);
if (png.length < 100 || png[1] !== 0x50) fail("画面を撮れなかった（画面が消えていないか確かめる）");
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(resolve(out), png);
console.log(`✓ ${out}（${(png.length / 1024).toFixed(0)}KB）。Read で開いて確かめる`);
