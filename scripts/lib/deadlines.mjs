// 締め切り（kit.config.json の deadlines）と「それまでにやること」。now / status / kit:alarm / kit:deadlines で使う。
// deadlines は運営が決めた動かない時刻（中間発表・Code Freeze・ピッチなど）。milestones（チームの目安）と違い kit:schedule でもずらさない。
// やること（items）の完了は GitHub の Issue で持つ（npm run kit:deadlines -- issues で1件ずつ作る。閉じたら完了）。
//   item: { id, what, owner: "<id>" | ["<id>", …] | "all", priority: "must" | "should" | "nice", by?: 締め切りより前の時刻 }
import { clock, fmtTime, ghJson } from "./kit.mjs";

export const PRIORITY = { must: "必須", should: "できれば", nice: "余裕があれば" };
const RANK = { must: 0, should: 1, nice: 2 };
export const MARK = (key) => `<!-- kit-deadline: ${key} -->`;

// 10/17 18:50 の形（日をまたぐイベントなので日付も出す）
export const fmtWhen = (iso) =>
  `${new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", timeZone: "Asia/Tokyo" })} ${fmtTime(iso)}`;

export const minutesUntil = (iso, now = clock()) => Math.round((Date.parse(iso) - now.getTime()) / 60000);

// 「あと52分」「あと3時間10分」「10分過ぎた」「2時間過ぎた」
export function leftText(min) {
  const hm = (m) => (m < 60 ? `${m}分` : `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ""}`);
  return min < 0 ? `${hm(-min)}過ぎた` : `あと${hm(min)}`;
}

export const ownersOf = (item, cfg) =>
  item.owner === "all" ? cfg.members.map((m) => m.id) : [item.owner].flat().filter(Boolean);
export const ownerText = (item) => (item.owner === "all" ? "全員" : [item.owner].flat().join(", "));

// 締め切りを時刻順に。items には key（<締め切りid>/<item id>）と due（by があればそれ）を付ける
export function deadlines(cfg) {
  return [...(cfg.deadlines ?? [])]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((d) => ({
      ...d,
      items: (d.items ?? [])
        .map((i) => ({ ...i, key: `${d.id}/${i.id}`, due: i.by ?? d.at, deadline: d }))
        .sort((a, b) => RANK[a.priority] - RANK[b.priority] || Date.parse(a.due) - Date.parse(b.due)),
    }));
}

// やることの Issue（ラベル deadline）を key ごとに。取れなければ null（完了かどうか分からない）
// ラベルで絞らずに全部取り、本文の目印で探す。ラベルで絞った一覧は、作った直後の数秒は新しい Issue を返さず、
// kit:deadlines -- issues を続けて実行すると同じ Issue を重ねて作った（kit-rehearsal-3 で確認）
export function deadlineIssues() {
  const list = ghJson("issue list --state all --limit 1000 --json number,state,body");
  if (!list) return null;
  const map = new Map();
  for (const i of list) {
    const m = /<!-- kit-deadline: (\S+) -->/.exec(i.body ?? "");
    if (m) map.set(m[1], { number: i.number, done: i.state === "CLOSED" });
  }
  return map;
}

// 1件の状態: done（Issue が閉じた）/ open（Issue が開いている）/ unknown（Issue がない・取れない）
export function itemState(item, issues) {
  const i = issues?.get(item.key);
  if (!i) return { state: "unknown" };
  return { state: i.done ? "done" : "open", number: i.number };
}

// 今から見て関係のある締め切り: まだ来ていないもの（近い順に limit 件）と、過ぎたが未完了のやることが残るもの
export function relevantDeadlines(cfg, issues, { now = clock(), limit = 2 } = {}) {
  const all = deadlines(cfg);
  const upcoming = all.filter((d) => Date.parse(d.at) > now.getTime()).slice(0, limit);
  const overdue = all.filter(
    (d) => Date.parse(d.at) <= now.getTime() && d.items.some((i) => itemState(i, issues).state === "open"),
  );
  return [...overdue, ...upcoming];
}

// 締め切りのブロックを文字にする（now / status 用）。me があれば自分の担当に印を付けて先頭へ
export function renderDeadline(d, cfg, issues, { me, now = clock(), onlyUndone = false } = {}) {
  const lines = [
    `## 締め切り: ${d.name} ${fmtWhen(d.at)}（${leftText(minutesUntil(d.at, now))}）${d.note ? ` — ${d.note}` : ""}`,
  ];
  const items = [...d.items].sort((a, b) => {
    const mine = (i) => (me && ownersOf(i, cfg).includes(me.id) ? 0 : 1);
    return mine(a) - mine(b);
  });
  for (const i of items) {
    const st = itemState(i, issues);
    if (onlyUndone && st.state === "done") continue;
    const mark = { done: "✓", open: "✗", unknown: "・" }[st.state];
    const due = i.by ? `（${fmtTime(i.by)} まで・${leftText(minutesUntil(i.by, now))}）` : "";
    const mine = me && ownersOf(i, cfg).includes(me.id) ? " ← 自分" : "";
    lines.push(
      `  ${PRIORITY[i.priority]} ${mark} ${i.what}${due} … ${ownerText(i)}${st.number ? ` #${st.number}` : ""}${mine}`,
    );
  }
  if (!items.length) lines.push("  （必須のやることはなし）");
  return lines;
}
