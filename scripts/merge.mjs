// npm run merge -- [PR番号] — CI が「今の先頭のコミット」で通ったのを確かめてからマージする（番号を省くと今のブランチの PR）。
// なぜ: 無料のプライベートリポジトリではブランチ保護が使えない。push 直後の `gh pr checks --watch` は
//   「no checks reported」で即座に正常終了するので、CI が始まる前にマージしてしまう（リハーサル3で4人が踏んだ）。
// 手順: 下書きなら解除 → main より遅れていれば止める（比較 API で数える）→ 先頭コミットの CI が現れて全部終わるまで待つ → 全部成功ならマージ。
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { currentMember, p } from "./lib/kit.mjs";
import { appendLog, minutesSinceStart } from "./lib/log.mjs";

const arg = process.argv[2];
const WAIT_START_MS = 3 * 60 * 1000; // CI が現れるまで待つ上限
const WAIT_DONE_MS = 20 * 60 * 1000; // CI が終わるまで待つ上限
const POLL_MS = 10 * 1000;
const OK = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"]);

const gh = (...a) => execFileSync("gh", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const view = () =>
  JSON.parse(
    gh(
      "pr",
      "view",
      ...(arg ? [arg] : []),
      "--json",
      "number,state,isDraft,headRefOid,mergeStateStatus,statusCheckRollup,headRefName,baseRefName,title,url",
    ),
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
// main より何コミット遅れているか。mergeStateStatus の BEHIND はブランチ保護で「最新を取り込む」を必須にした時しか出ないので、
// 無料のプライベートリポジトリでは使えない。GitHub の比較 API で直接数える（数えられなければ null）
const behindBy = (base, head) => {
  try {
    return Number(gh("api", `repos/{owner}/{repo}/compare/${base}...${head}`, "--jq", ".behind_by"));
  } catch {
    return null;
  }
};
const BEHIND_MSG = "main を取り込んで（git pull origin main）`npm run check` → push してから、もう一度 npm run merge。";
// PR で動くはずのワークフロー名（.github/workflows のうち on: に pull_request があるもの）。
// 全部が現れるまで「CI が始まった」とみなさない（1つ目が見えた時点で数えると、遅れて始まる方を待たずにマージする）
const expectedWorkflows = (() => {
  const dir = p(".github/workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => {
      const text = readFileSync(`${dir}/${f}`, "utf8");
      const head = text.split(/^jobs:/m)[0];
      if (!/\bpull_request\b/.test(head)) return null;
      return /^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(head)?.[1] ?? f;
    })
    .filter(Boolean);
})();

let pr;
try {
  pr = view();
} catch (e) {
  fail(`PR が見つからない（${arg ? `#${arg}` : "今のブランチ"}）: ${String(e.stderr ?? e.message).trim()}`);
}
if (pr.state !== "OPEN") fail(`#${pr.number} は ${pr.state}（マージできるのは OPEN だけ）`);
const sha = pr.headRefOid;
console.log(`#${pr.number}（${pr.headRefName} @ ${sha.slice(0, 7)}）`);

if (pr.isDraft) {
  gh("pr", "ready", String(pr.number));
  console.log("  下書きを解除した");
}
if (pr.mergeStateStatus === "DIRTY") fail(`main と衝突している。${BEHIND_MSG}`);
const behind = behindBy(pr.baseRefName, sha);
// 差を数えられないときは止める。確かめずに進むと、古い main を前提にした変更が入ることがある（レビュー指摘）
if (behind === null)
  fail(`main との差を GitHub に確かめられなかった（gh api）。マージしない。少し待ってから、もう一度 npm run merge`);
if (behind > 0) fail(`main より ${behind} コミット遅れている（CI は古い main と合わせて試しただけ）。${BEHIND_MSG}`);

// 先頭コミットの CI だけを見る（古いコミットの「成功」で通さない）
const started = Date.now();
let seen = false;
for (;;) {
  const now = view();
  if (now.headRefOid !== sha) fail("待っている間に新しいコミットが push された。もう一度 npm run merge を実行する。");
  // statusCheckRollup は先頭コミットの分。CheckRun（status/conclusion）と StatusContext（state）が混ざる
  const checks = now.statusCheckRollup ?? [];
  const names = new Set(checks.map((c) => c.workflowName).filter(Boolean));
  const missing = expectedWorkflows.filter((w) => !names.has(w));
  if (checks.length && !missing.length) seen = true;
  const isPending = (c) =>
    c.__typename === "StatusContext" ? ["PENDING", "EXPECTED"].includes(c.state) : c.status !== "COMPLETED";
  const pending = checks.filter(isPending);
  const elapsed = Math.round((Date.now() - started) / 1000);
  if (!seen) {
    if (Date.now() - started > WAIT_START_MS)
      fail(
        `CI が始まらない${missing.length ? `: ${missing.join(", ")}` : ""}（.github/workflows を確認）。マージしない。`,
      );
    console.log(`  CI の開始を待っている…（${elapsed}秒${missing.length ? `、まだ: ${missing.join(", ")}` : ""}）`);
  } else if (pending.length) {
    if (Date.now() - started > WAIT_DONE_MS)
      fail(`CI が終わらない: ${pending.map((c) => c.name ?? c.context).join(", ")}`);
    console.log(`  CI の終了を待っている…（${elapsed}秒、残り ${pending.length}）`);
  } else {
    const bad = checks.filter((c) => !OK.has(c.conclusion ?? c.state));
    if (bad.length)
      fail(
        `CI が通っていない: ${bad.map((c) => `${c.name ?? c.context}=${c.conclusion ?? c.state}`).join(", ")}（npm run now で確認して直す）`,
      );
    console.log(`  ✓ CI がすべて成功（${checks.length} 件）`);
    break;
  }
  await sleep(POLL_MS);
}

// 待っている間に main が進んでいたら止める（他の人が先にマージした）
const behindNow = behindBy(pr.baseRefName, sha);
if (behindNow === null)
  fail("マージの直前に main との差を確かめられなかった（gh api）。マージしない。もう一度 npm run merge");
if (behindNow > 0) fail(`待っている間に main が ${behindNow} コミット進んだ。${BEHIND_MSG}`);

try {
  // 先頭コミットが確かめたものと同じ時だけマージする
  gh("pr", "merge", String(pr.number), "--squash", "--delete-branch", "--match-head-commit", sha);
} catch (e) {
  fail(`マージできなかった: ${String(e.stderr ?? e.message).trim()}`);
}
// 個人の作業ログ（リポジトリの外）。他人の PR をマージした時は書かない
const me = currentMember();
if (me && pr.headRefName.startsWith(`${me.id}/`)) {
  const min = minutesSinceStart(me, pr.headRefName);
  appendLog(me, "完了", `#${pr.number} ${pr.title}（${pr.url}）${min === null ? "" : ` ${min}分`}`);
}
console.log(`✓ #${pr.number} をマージした。次: git switch main && git pull → npm run now`);
