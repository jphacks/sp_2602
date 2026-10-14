// npm run merge -- [PR番号] — CI が「今の先頭のコミット」で通ったのを確かめてからマージする（番号を省くと今のブランチの PR）。
// なぜ: 無料のプライベートリポジトリではブランチ保護が使えない。push 直後の `gh pr checks --watch` は
//   「no checks reported」で即座に正常終了するので、CI が始まる前にマージしてしまう（リハーサル3で4人が踏んだ）。
// 手順: 下書きなら解除 → main より遅れていれば止める → 先頭コミットの CI が現れて全部終わるまで待つ → 全部成功ならマージ。
import { execFileSync } from "node:child_process";

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
      "number,state,isDraft,headRefOid,mergeStateStatus,statusCheckRollup,headRefName",
    ),
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

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
if (pr.mergeStateStatus === "BEHIND" || pr.mergeStateStatus === "DIRTY")
  fail("main より遅れている（または衝突している）。main を取り込んで `npm run check` → push してから、もう一度。");

// 先頭コミットの CI だけを見る（古いコミットの「成功」で通さない）
const started = Date.now();
let seen = false;
for (;;) {
  const now = view();
  if (now.headRefOid !== sha) fail("待っている間に新しいコミットが push された。もう一度 npm run merge を実行する。");
  // statusCheckRollup は先頭コミットの分。CheckRun（status/conclusion）と StatusContext（state）が混ざる
  const checks = now.statusCheckRollup ?? [];
  if (checks.length) seen = true;
  const isPending = (c) =>
    c.__typename === "StatusContext" ? ["PENDING", "EXPECTED"].includes(c.state) : c.status !== "COMPLETED";
  const pending = checks.filter(isPending);
  const elapsed = Math.round((Date.now() - started) / 1000);
  if (!seen) {
    if (Date.now() - started > WAIT_START_MS) fail("CI が始まらない（.github/workflows を確認）。マージしない。");
    console.log(`  CI の開始を待っている…（${elapsed}秒）`);
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

try {
  // 先頭コミットが確かめたものと同じ時だけマージする
  gh("pr", "merge", String(pr.number), "--squash", "--delete-branch", "--match-head-commit", sha);
} catch (e) {
  fail(`マージできなかった: ${String(e.stderr ?? e.message).trim()}`);
}
console.log(`✓ #${pr.number} をマージした。次: git switch main && git pull → npm run now`);
