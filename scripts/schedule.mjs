// npm run kit:schedule — 時刻表（kit.config.json の milestones）を見る・ずらす（lead）。
//   npm run kit:schedule                      今の時刻表と現在地
//   npm run kit:schedule -- shift <分>         全部を <分> ずらす（-30 で30分前へ）
//   npm run kit:schedule -- from <id> <HH:MM>  <id> が今日の HH:MM になるように、時刻表全体を同じだけずらす
// どちらも、もう過ぎた時刻を未来へ戻すことはしない（遅れて後ろへずらしても、凍結済みの契約が開き直らないように）。
// 進み方が時計とずれたら（早く終わった・遅れた）、手で JSON を直さずにこれで直す。now の「フェーズ」が実際と合うようにするため
// （リハーサル3: 時刻表が古いままで、now が「キックオフまであと5603分」と出た）。変えたら decisions.md に1行。
import { readFileSync, writeFileSync } from "node:fs";
import { loadConfig, p, phaseAt } from "./lib/kit.mjs";

const [cmd, a, b] = process.argv.slice(2);
const cfg = loadConfig();
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const hhmm = (iso) => new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
// 元の文字列の時差（+09:00 など）を保ったまま書き戻す
const withOffset = (ms, like) => {
  const off = /([+-]\d{2}):?(\d{2})$/.exec(like);
  const sign = off?.[1].startsWith("-") ? -1 : 1;
  const offMin = off ? sign * (Math.abs(Number(off[1])) * 60 + Number(off[2])) : 0;
  const local = new Date(ms + offMin * 60000).toISOString().slice(0, 19);
  return off ? `${local}${off[1]}:${off[2]}` : new Date(ms).toISOString();
};

function show() {
  const ph = phaseAt(cfg);
  console.log(`時刻表（${cfg.project}）`);
  for (const m of [...cfg.milestones].sort((x, y) => Date.parse(x.at) - Date.parse(y.at)))
    console.log(
      `  ${m.id === ph?.current?.id ? "▶" : " "} ${hhmm(m.at)}  ${m.name}（${m.id}）${m.sync ? "  同期点" : ""}`,
    );
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
  if (!m) fail(`milestone ${a} がない（${cfg.milestones.map((x) => x.id).join(", ")}）`);
  const t = /^(\d{1,2}):(\d{2})$/.exec(b ?? "");
  if (!t) fail("使い方: npm run kit:schedule -- from <id> <HH:MM>（今日のその時刻にする）");
  const target = new Date();
  target.setHours(Number(t[1]), Number(t[2]), 0, 0);
  deltaMs = target.getTime() - Date.parse(m.at);
} else fail("使い方: npm run kit:schedule [shift <分> | from <id> <HH:MM>]");

// JSON を作り直さず、時刻の文字列だけを置き換える（kit.config.json の書式とコメントを保つ）
let text = readFileSync(p("kit.config.json"), "utf8");
const now = Date.now();
// もう過ぎた時刻が、ずらすと未来になるなら動かさない
const move = (iso) => {
  const t = Date.parse(iso);
  return t <= now && t + deltaMs > now ? iso : withOffset(t + deltaMs, iso);
};
for (const m of cfg.milestones) {
  const next = move(m.at);
  text = text.replace(`"at": "${m.at}"`, `"at": "${next}"`);
  m.at = next;
}
for (const k of ["start", "end"]) {
  const next = move(cfg.event[k]);
  text = text.replace(`"${k}": "${cfg.event[k]}"`, `"${k}": "${next}"`);
  cfg.event[k] = next;
}
writeFileSync(p("kit.config.json"), text);
console.log(`✓ ${Math.round(deltaMs / 60000)} 分ずらした。decisions.md に「時刻表を変えた理由」を1行書く`);
show();
