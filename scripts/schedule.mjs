// npm run kit:schedule — 時刻表を見る・チームの目安（kit.config.json の milestones）をずらす（まとめ役 = kit.config.json の facilitator）。
// kit.config.json は lead の所有だが、時刻だけを変える変更はまとめ役もコミットできる（check-scope の例外）。
//   npm run kit:schedule                      締め切りと目安の一覧と現在地
//   npm run kit:schedule -- shift <分>         目安を全部 <分> ずらす（-30 で30分前へ）
//   npm run kit:schedule -- from <id> <HH:MM>  目安 <id> が「その目安の日」の HH:MM になるように、目安全体を同じだけずらす
// 運営の締め切り（deadlines）とイベントの開始・終了（event）は動かさない。
// どちらも、もう過ぎた時刻を未来へ戻すことはしない（遅れて後ろへずらしても、凍結済みの契約が開き直らないように）。
// 進み方が時計とずれたら（早く終わった・遅れた）、手で JSON を直さずにこれで直す。now の「フェーズ」が実際と合うようにするため
// （リハーサル3: 時刻表が古いままで、now が「キックオフまであと5603分」と出た）。変えたら decisions.md に1行。
import { readFileSync, writeFileSync } from "node:fs";
import { deadlines, fmtWhen } from "./lib/deadlines.mjs";
import { clock, loadConfig, p, phaseAt } from "./lib/kit.mjs";

const [cmd, a, b] = process.argv.slice(2);
const cfg = loadConfig();
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
// 元の文字列の時差（+09:00 など）を保ったまま書き戻す
const withOffset = (ms, like) => {
  const off = /([+-]\d{2}):?(\d{2})$/.exec(like);
  const sign = off?.[1].startsWith("-") ? -1 : 1;
  const offMin = off ? sign * (Math.abs(Number(off[1])) * 60 + Number(off[2])) : 0;
  const local = new Date(ms + offMin * 60000).toISOString().slice(0, 19);
  return off ? `${local}${off[1]}:${off[2]}` : new Date(ms).toISOString();
};

function show(c = cfg) {
  const ph = phaseAt(c);
  console.log(`時刻表（${c.project}）`);
  const rows = [
    ...deadlines(c).map((d) => ({ at: d.at, text: `【締め切り】${d.name}（${d.id}・動かさない）` })),
    ...c.milestones.map((m) => ({
      at: m.at,
      text: `${m.name}（${m.id}）${m.sync ? "  同期点" : ""}`,
      current: m.id === ph?.current?.id,
    })),
  ].sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
  for (const r of rows) console.log(`  ${r.current ? "▶" : " "} ${fmtWhen(r.at)}  ${r.text}`);
}

if (!cmd) {
  show();
  process.exit(0);
}

let deltaMs;
if (cmd === "shift") {
  const min = Number(a);
  if (!Number.isFinite(min) || !a) fail("使い方: npm run kit:schedule -- shift <分>（例: -30）");
  deltaMs = min * 60000;
} else if (cmd === "from") {
  const m = cfg.milestones.find((x) => x.id === a);
  if (!m) fail(`目安 ${a} がない（${cfg.milestones.map((x) => x.id).join(", ")}。締め切りは動かせない）`);
  const t = /^(\d{1,2}):(\d{2})$/.exec(b ?? "");
  if (!t)
    fail("使い方: npm run kit:schedule -- from <id> <HH:MM>（その目安の日の HH:MM にする。日をまたぐなら shift）");
  // 「今日」ではなく、その目安の日付で考える（2日間のイベントで、1日目に2日目の目安を指定しても1日目へ動かないように）
  const off = /(Z|[+-]\d{2}:?\d{2})$/.exec(m.at)?.[1] ?? "Z";
  const target = Date.parse(`${m.at.slice(0, 10)}T${t[1].padStart(2, "0")}:${t[2]}:00${off}`);
  if (!Number.isFinite(target)) fail(`${m.id} の時刻 ${m.at} を読めない`);
  deltaMs = target - Date.parse(m.at);
} else fail("使い方: npm run kit:schedule [shift <分> | from <id> <HH:MM>]");

// JSON を作り直さず、milestones の中の時刻の文字列だけを置き換える（kit.config.json の書式を保ち、締め切りと event を巻き込まない）
const original = readFileSync(p("kit.config.json"), "utf8");
function milestonesSpan(text) {
  const start = text.indexOf('"milestones": [');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = text.indexOf("[", start); i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return [start, i + 1];
  }
  return null;
}
const span = milestonesSpan(original);
if (!span) fail("kit.config.json に milestones が見つからない");

const now = clock().getTime();
// 運営の Code Freeze（deadlines の freeze: true）より前の目安は、ずらしてもその15分前より後ろへは出さない
// （遅れて後ろへずらすと、バックアップ録画などの目安が Code Freeze を越えてしまう）
const freezes = (cfg.deadlines ?? []).filter((d) => d.freeze).map((d) => Date.parse(d.at));
const clamped = [];
// もう過ぎた時刻が、ずらすと未来になるなら動かさない
const move = (iso) => {
  const t = Date.parse(iso);
  if (t <= now && t + deltaMs > now) return iso;
  let next = t + deltaMs;
  for (const f of freezes) {
    const cap = Math.max(t, f - 15 * 60000);
    if (t < f && next > cap) {
      next = cap;
      clamped.push(iso);
    }
  }
  return withOffset(next, iso);
};
// 1回の走査で「元の時刻 → 新しい時刻」に置き換える。1件ずつ replace すると、ずらした後の時刻が次の予定の元の時刻と同じ時
// （30分・1時間刻みの時刻表ではほぼ毎回）同じ行を2回ずらし、次の予定は動かなかった
const before = cfg.milestones.map((m) => m.at);
const moved = new Map(before.map((iso) => [iso, move(iso)]));
const block = original
  .slice(...span)
  .replace(/"at": "([^"]+)"/g, (all, iso) => (moved.has(iso) ? `"at": "${moved.get(iso)}"` : all));
writeFileSync(p("kit.config.json"), original.slice(0, span[0]) + block + original.slice(span[1]));

// 表示はファイルを読み直して行う（書いた結果をそのまま見せる）。期待どおりでなければ元に戻す
const after = loadConfig();
const fixed = (c) => JSON.stringify({ event: c.event, deadlines: c.deadlines ?? [] });
const bad = after.milestones.some((m, i) => m.at !== moved.get(before[i])) || fixed(after) !== fixed(cfg);
if (bad) {
  writeFileSync(p("kit.config.json"), original);
  fail("kit.config.json の書き換えが期待どおりにならなかったので元に戻した（手で直す）");
}
console.log(
  `✓ 目安を ${Math.round(deltaMs / 60000)} 分ずらした（締め切りは動かしていない）。decisions.md に「時刻表を変えた理由」を1行書く`,
);
const names = after.milestones.filter((_, i) => clamped.includes(before[i])).map((m) => m.name);
if (names.length)
  console.log(
    `! ${names.join("・")} は Code Freeze を越えないよう、その15分前で止めた（残りのステップを減らす判断が要る）`,
  );
show(after);
