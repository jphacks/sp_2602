// npm run kit:alarm — 締め切りと目安が近づいたら知らせる見張り役。当日は別のターミナルでずっと動かしておく（Ctrl+C で止める）。
//   締め切り（kit.config.json の deadlines）: 残り60分・30分・10分・時刻ちょうどに、まだ終わっていないやること（自分の担当と全員のもの）を知らせる
//   目安（milestones）: 時刻ちょうどに1回、名前とルールを知らせる
//   知らせ方: この画面に出す＋OS の通知（音は鳴らさない）。完了は Issue（ラベル deadline）が閉じたかで見る（3分ごとに取り直す）
//   --all  全員の担当を知らせる（まとめ役 = facilitator は付けなくても全員分）
//   --test 通知が出るかだけ試す（前日に1回）
//   --once 今の状況を1回出して終わる
//   --no-notify OS の通知を出さず、この画面にだけ出す（AI のメンバー・試験用）
import { execFileSync } from "node:child_process";
import {
  deadlineIssues,
  deadlines,
  fmtWhen,
  itemState,
  leftText,
  minutesUntil,
  ownersOf,
  ownerText,
  PRIORITY,
  relevantDeadlines,
  renderDeadline,
} from "./lib/deadlines.mjs";
import { clock, clockSpeed, currentMember, fmtTime, loadConfig } from "./lib/kit.mjs";

const args = process.argv.slice(2);
const THRESHOLDS = [60, 30, 10, 0];
const TICK_MS = Math.max(1000, (30 * 1000) / clockSpeed); // 早送り（KIT_CLOCK_SPEED）の試験では細かく見る
const ISSUES_EVERY_MS = 3 * 60 * 1000; // 実際の時間で3分ごと

// ---- 通知（音なし） ----
const xmlEscape = (s) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
function notify(title, body) {
  if (process.platform === "win32") {
    // Windows PowerShell 5.1 の WinRT でトースト通知を出す（pwsh 7 では WinRT の型が使えない）。XML は環境変数で渡す（引用符の崩れを避ける）
    const xml = `<toast duration="long"><visual><binding template="ToastGeneric"><text>${xmlEscape(title)}</text><text>${xmlEscape(body)}</text></binding></visual><audio silent="true"/></toast>`;
    const ps = [
      "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
      "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null",
      "$x = New-Object Windows.Data.Xml.Dom.XmlDocument",
      "$x.LoadXml($env:KIT_TOAST_XML)",
      "$t = [Windows.UI.Notifications.ToastNotification]::new($x)",
      "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show($t)",
    ].join("; ");
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {
      env: { ...process.env, KIT_TOAST_XML: xml },
      stdio: ["ignore", "ignore", "pipe"],
    });
  } else if (process.platform === "darwin") {
    const q = (s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    execFileSync("osascript", ["-e", `display notification ${q(body)} with title ${q(title)}`], { stdio: "ignore" });
  } else execFileSync("notify-send", [title, body], { stdio: "ignore" });
}
let notifyBroken = args.includes("--no-notify");
function tell(title, lines) {
  const stamp = fmtTime(clock().toISOString());
  console.log(`\n[${stamp}] ${title}\n${lines.map((l) => `  ${l}`).join("\n")}`);
  if (notifyBroken) return;
  try {
    notify(title, lines.join("\n").slice(0, 250));
  } catch (e) {
    notifyBroken = true;
    console.log(
      `  （OS の通知を出せなかった。以降はこの画面にだけ出す: ${
        String(e.stderr ?? e.message)
          .trim()
          .split("\n")[0]
      }）`,
    );
  }
}

if (args.includes("--test")) {
  tell("kit:alarm のテスト", ["この通知が見えれば準備完了（音は鳴りません）"]);
  process.exit(notifyBroken ? 1 : 0);
}

// ---- 見張り ----
const cfg0 = loadConfig();
const me = currentMember(cfg0);
const showAll = args.includes("--all") || (me && me.id === cfg0.facilitator);
if (!me && !showAll) console.log("! 自分が未設定（npm run kit:whoami -- <id>）。全員の担当を知らせる");
const watching = (item, cfg) => !me || showAll || ownersOf(item, cfg).includes(me.id);

let issues = null;
let issuesAt = 0;
const refreshIssues = () => {
  if (Date.now() - issuesAt < ISSUES_EVERY_MS) return;
  issues = deadlineIssues() ?? issues; // 取れなかったときは前回の結果を使う
  issuesAt = Date.now();
};

// 「すでに過ぎた区切り」は起動時に知らせ済みとして扱う（起動のたびに過去の分がまとめて鳴らないように）
const fired = new Set();
function crossings(cfg, now) {
  const due = [];
  for (const d of deadlines(cfg))
    for (const i of d.items)
      for (const th of THRESHOLDS) {
        const key = `d:${i.key}@${i.due}#${th}`;
        if (minutesUntil(i.due, now) <= th) due.push({ key, d, i, th });
      }
  for (const m of cfg.milestones) {
    const key = `m:${m.id}@${m.at}`;
    if (Date.parse(m.at) <= now.getTime()) due.push({ key, m });
  }
  return due;
}

function tick(first) {
  const cfg = loadConfig(); // まとめ役が kit:schedule で目安をずらしたら、pull した時点で反映する
  const now = clock();
  refreshIssues();
  const fresh = crossings(cfg, now).filter((c) => !fired.has(c.key));
  for (const c of fresh) fired.add(c.key);
  if (first) return;
  // 同じ締め切り・同じ時刻のやることは1つの通知にまとめる。区切りを一度に複数越えたら（スリープ明けなど）一番小さい区切りで出す
  const groups = new Map();
  for (const c of fresh) {
    if (c.m) {
      tell(`目安: ${c.m.name}（${fmtTime(c.m.at)}）`, [c.m.rule]);
      continue;
    }
    if (itemState(c.i, issues).state === "done" || !watching(c.i, cfg)) continue; // 終わったもの・関係ないものは知らせない
    const g = `${c.d.id}@${c.i.due}`;
    const entry = groups.get(g) ?? { d: c.d, due: c.i.due, th: c.th, items: new Map() };
    entry.th = Math.min(entry.th, c.th);
    entry.items.set(c.i.key, c.i);
    groups.set(g, entry);
  }
  for (const { d, due, th, items } of groups.values()) {
    const head = th === 0 ? `${d.name}: ${fmtTime(due)} になった` : `${d.name}: ${fmtTime(due)} まであと${th}分`;
    const lines = [...items.values()].map((i) => `${PRIORITY[i.priority]} ${i.what}（${ownerText(i)}）`);
    if (th === 0 && d.freeze && due === d.at) lines.unshift("コミット・push はしない");
    tell(`⏰ ${head}`, lines);
  }
}

function summary() {
  const cfg = loadConfig();
  const now = clock();
  issues = deadlineIssues();
  issuesAt = Date.now();
  console.log(`kit:alarm ${fmtWhen(now.toISOString())}  知らせる担当: ${showAll ? "全員" : `${me.id} と全員のもの`}`);
  for (const d of relevantDeadlines(cfg, issues, { now }))
    console.log(renderDeadline(d, cfg, issues, { me, now, onlyUndone: true }).join("\n"));
  const nextM = cfg.milestones.find((m) => Date.parse(m.at) > now.getTime());
  if (nextM) console.log(`次の目安: ${fmtWhen(nextM.at)} ${nextM.name}（${leftText(minutesUntil(nextM.at, now))}）`);
  if (issues === null) console.log("（GitHub の Issue を取得できないので、終わったものも知らせる）");
}

summary();
if (args.includes("--once")) process.exit(0);
tick(true);
console.log("\n見張りを始めた（Ctrl+C で止める）。残り60分・30分・10分・時刻ちょうどに知らせる");
setInterval(() => tick(false), TICK_MS);
