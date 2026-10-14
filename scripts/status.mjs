// npm run status — 全員の状況を1画面に（まとめ役が同期点で使う。誰でも見てよい）。
// GitHub の PR・Issue から作る（md に進捗は書かない）。メンバーは PR のブランチ名の先頭 <id>/ と、Issue の assign（共有アカウントなら member:<id> ラベル）で見分ける。
//   作業中   : 下書きの PR（npm run declare が作る）＝ 今やっているステップ
//   マージ待ち: 下書きでない PR（CI 失敗なら印）
//   最後の動き: その人の PR が最後に更新された・マージされた時刻。30分以上なければ印（止まっている・詰まっているかも）
//   頼まれごと: その人宛ての open な Issue（bug / blocked / help / change-request / task）
//   締め切り : 次の締め切りまでの、その人の担当で終わっていないやること
import {
  deadlineIssues,
  itemState,
  leftText,
  minutesUntil,
  ownersOf,
  PRIORITY,
  relevantDeadlines,
} from "./lib/deadlines.mjs";
import { clock, fmtTime, ghJson, loadConfig, phaseAt, sharesAccount } from "./lib/kit.mjs";

const IDLE_MIN = 30;
const cfg = loadConfig();
const now = clock();

const open = ghJson(
  "pr list --state open --limit 100 --json number,title,headRefName,isDraft,updatedAt,statusCheckRollup",
);
if (!open) {
  console.error("✗ gh で PR を取得できない（gh auth status / remote を確認）");
  process.exit(1);
}
const merged = ghJson("pr list --state merged --limit 100 --json number,headRefName,mergedAt") ?? [];
const issues = ghJson("issue list --state open --limit 200 --json number,title,labels,assignees") ?? [];
const dIssues = deadlineIssues();

const { current } = phaseAt(cfg, now);
const relevant = relevantDeadlines(cfg, dIssues, { now, limit: 1 });
const nextD = relevant.find((d) => Date.parse(d.at) > now.getTime());
console.log(
  `## 全員の状況 ${fmtTime(now.toISOString())}  目安: ${current?.name ?? "開始前"}${nextD ? `  次の締め切り: ${nextD.name} ${fmtTime(nextD.at)}（${leftText(minutesUntil(nextD.at, now))}）` : ""}`,
);

const byMember = (id) => (pr) => pr.headRefName.startsWith(`${id}/`);
const ago = (iso) => Math.round((now.getTime() - Date.parse(iso)) / 60000);
const failed = (pr) => (pr.statusCheckRollup ?? []).some((c) => ["FAILURE", "ERROR"].includes(c.conclusion ?? c.state));
const typeOf = (i) =>
  ["bug", "blocked", "help", "change-request", "task", "deadline"].find((t) => i.labels?.some((l) => l.name === t)) ??
  "issue";
const flags = [];

for (const m of cfg.members) {
  const mine = open.filter(byMember(m.id));
  const wip = mine.filter((pr) => pr.isDraft);
  const ready = mine.filter((pr) => !pr.isDraft);
  const times = [...mine.map((pr) => pr.updatedAt), ...merged.filter(byMember(m.id)).map((pr) => pr.mergedAt)];
  const last = times.length ? times.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b)) : null;
  const idle = last ? ago(last) : null;
  const assigned = issues.filter((i) =>
    sharesAccount(cfg, m)
      ? i.labels?.some((l) => l.name === `member:${m.id}`)
      : i.assignees?.some((a) => a.login.toLowerCase() === m.github.toLowerCase()),
  );
  const asks = assigned.filter((i) => typeOf(i) !== "deadline");
  const dues = relevant.flatMap((d) =>
    d.items.filter((i) => ownersOf(i, cfg).includes(m.id) && itemState(i, dIssues).state !== "done"),
  );

  const role = m.id === cfg.facilitator ? "（まとめ役）" : m.id === cfg.members[0].id ? "（つなぎ役）" : "";
  console.log(`\n${m.id}${role}`);
  console.log(
    `  作業中: ${wip.length ? wip.map((pr) => `#${pr.number} ${pr.title}`).join(" / ") : "なし（下書き PR がない）"}`,
  );
  if (ready.length)
    console.log(
      `  マージ待ち: ${ready.map((pr) => `#${pr.number} ${pr.title}${failed(pr) ? " ← CI 失敗" : ""}`).join(" / ")}`,
    );
  console.log(
    `  最後の動き: ${last ? `${idle}分前` : "まだない"}${idle !== null && idle >= IDLE_MIN ? `  ← ${IDLE_MIN}分以上動きなし` : ""}`,
  );
  if (asks.length) console.log(`  頼まれごと: ${asks.map((i) => `#${i.number}[${typeOf(i)}] ${i.title}`).join(" / ")}`);
  if (dues.length)
    console.log(
      `  締め切りの担当: ${dues.map((i) => `${PRIORITY[i.priority]} ${i.what}（${leftText(minutesUntil(i.due, now))}）`).join(" / ")}`,
    );

  if (idle !== null && idle >= IDLE_MIN)
    flags.push(`${m.id}: ${idle}分動きなし → 声をかける（詰まっていれば合流を検討）`);
  if (!wip.length && !ready.length) flags.push(`${m.id}: 作業中の PR がない → 次のステップか手伝いを渡す`);
  for (const pr of ready.filter(failed)) flags.push(`${m.id}: PR #${pr.number} の CI 失敗`);
  for (const i of dues.filter((i) => i.priority === "must" && minutesUntil(i.due, now) <= 60))
    flags.push(`${m.id}: 必須「${i.what}」${leftText(minutesUntil(i.due, now))}`);
}

const blocked = issues.filter((i) => typeOf(i) === "blocked");
if (blocked.length)
  flags.push(
    `止まっている: ${blocked.map((i) => `#${i.number} ${i.title}`).join(" / ")}（30分以上ならまとめ役がその場で合流を決めてよい）`,
  );
const nobody = issues.filter((i) => !i.assignees?.length && !i.labels?.some((l) => l.name.startsWith("member:")));
if (nobody.length) flags.push(`宛先のない Issue: ${nobody.map((i) => `#${i.number}`).join(" ")}（宛先を決める）`);

console.log(`\n## まとめ役が見ること${flags.length ? "" : ": なし"}`);
for (const f of flags) console.log(`- ${f}`);
if (dIssues === null)
  console.log("（締め切りの Issue を取得できないので、締め切りの担当は全部未完了として出している）");
