// npm run now — 「今何をするか」を決めるための状況を短く出す。AI も人間も作業の区切りごとに実行する。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  deadlineIssues,
  itemState,
  leftText,
  minutesUntil,
  ownersOf,
  PRIORITY,
  relevantDeadlines,
  renderDeadline,
} from "./lib/deadlines.mjs";
import { apiRoutes, gaps, isStub, screenRows } from "./lib/gaps.mjs";
import {
  clock,
  currentMember,
  fmtTime,
  helpPhase,
  isLead,
  loadConfig,
  p,
  phaseAt,
  sh,
  stepStates,
} from "./lib/kit.mjs";
import { summary } from "./lib/log.mjs";

const cfg = loadConfig();
const me = currentMember(cfg);
const now = clock();
const out = [];
const todo = [];
const statePath = p(".kit-state.json");
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};

// 1. 時刻とフェーズ
const { current, next } = phaseAt(cfg, now);
const policy = current?.changes ?? "open";
const policyText = { open: "自由に変更可", additive: "追加のみ（change-request Issue 経由）", frozen: "変更禁止" }[
  policy
];
out.push(
  `## 時刻 ${fmtTime(now.toISOString())}  フェーズ（目安）: ${current ? current.name : "開始前"}  契約: ${policyText}`,
);
// 目安のルールは全員に同じ文が出る。担当（owner）がある目安は、誰の仕事かを添える（録画が全員の仕事に見えた。リハーサル6）
if (current) {
  const who =
    current.owner && `（担当: ${current.owner}${current.owner === me?.id ? " ← 自分" : "。自分の担当ではない"}）`;
  out.push(`ルール${who || ""}: ${current.rule}`);
}
if (next) out.push(`次の目安: ${fmtTime(next.at)} ${next.name}（${leftText(minutesUntil(next.at, now))}）`);
const help = helpPhase(cfg, now);
out.push(
  `合流: ${help.text}${help.nextSync ? `（次に合流を決める同期点 ${fmtTime(help.nextSync.at)} ${help.nextSync.name}）` : ""}`,
);
// 1b. 締め切り（運営が決めた動かない時刻と、それまでにやること。kit.config.json の deadlines）
// やることの完了は Issue（ラベル deadline）が閉じたかで見る。近い・過ぎたのに残っている自分の担当は「やること」の先頭へ
const urgent = [];
const stale = []; // 1時間以上前に期限が過ぎたのに残っているもの（閉じ忘れが多い）。先頭を占領しないよう最後に1行で出す
if ((cfg.deadlines ?? []).length) {
  const issues = sh("git remote get-url origin", { allowFail: true }) ? deadlineIssues() : null;
  for (const d of relevantDeadlines(cfg, issues, { now })) {
    out.push("", ...renderDeadline(d, cfg, issues, { me, now }));
    for (const i of d.items) {
      if (!me || !ownersOf(i, cfg).includes(me.id) || itemState(i, issues).state === "done") continue;
      const min = minutesUntil(i.due, now);
      const text = `【${d.name}・${PRIORITY[i.priority]}・${leftText(min)}】${i.what}${itemState(i, issues).number ? `（終わったら #${itemState(i, issues).number} を閉じる）` : ""}`;
      if (min < -60) stale.push(itemState(i, issues).number ? `#${itemState(i, issues).number}` : i.what);
      else if (min <= 60) urgent.push(text);
      else if (i.priority === "must" && min <= 180) todo.push(text);
    }
  }
  if (issues === null) out.push("（やることの完了は GitHub の Issue で見る。取得できないので ・ は未確認）");
  const frozen = (cfg.deadlines ?? []).find((d) => d.freeze && Date.parse(d.at) <= now.getTime());
  if (frozen) urgent.unshift(`${frozen.name}を過ぎた: コミット・push はしない（発表の準備へ）`);
}

// 2. 自分
if (!me) {
  out.push("\n## 自分: 未設定");
  todo.push("`npm run kit:whoami -- <id>` で自分を設定する（id は kit.config.json の members）");
} else {
  out.push(`\n## 自分: ${me.id}（${me.role}）`);
}

// 3. doctor
const doctorAge = state.doctorOkAt ? (now - new Date(state.doctorOkAt)) / 3600000 : Infinity;
if (doctorAge > 6) todo.push("`npm run doctor` が最近通っていない → まず通す");

// 4. git
const branch = sh("git symbolic-ref --short HEAD", { allowFail: true });
const dirty = (sh("git status --porcelain", { allowFail: true }) ?? "").split("\n").filter(Boolean).length;
const hasRemote = !!sh("git remote get-url origin", { allowFail: true });
let behind = 0;
// fetch に失敗すると origin/main が古いままで「遅れ 0」と出てしまうので、失敗したことを出す
// （ネットワーク・認証のほか、Codex のサンドボックスでは .git に書けず必ず失敗する: docs/kit/codex.md）
let fetchFailed = false;
if (hasRemote) {
  fetchFailed = sh("git fetch -q origin main", { allowFail: true }) === null;
  behind = Number(sh("git rev-list --count HEAD..origin/main", { allowFail: true }) ?? 0);
}
out.push(
  `\n## git: ${branch ?? "?"}  未コミット ${dirty}件  main より遅れ ${hasRemote ? `${behind}${fetchFailed ? "（fetch に失敗。前回の取得時点の数）" : ""}` : "（remote なし）"}`,
);
if (fetchFailed)
  todo.push(
    "`git fetch origin main` に失敗した → ネットワーク・認証を確かめる（Codex ならサンドボックスの外での実行を承認）。直したら npm run now をやり直す",
  );
if (branch === "main" && me)
  todo.push("main の上にいる → `npm run step -- S<番号> <英語名>` でステップ用のブランチを作ってから作業する");
if (behind > 0) todo.push(`main が ${behind} コミット先行 → \`git pull --rebase origin main\``);

// 5. 契約の変更（前回見た以降の CHANGELOG 行）
const cl = existsSync(p("contracts/CHANGELOG.md"))
  ? readFileSync(p("contracts/CHANGELOG.md"), "utf8")
      .split("\n")
      .filter((l) => l.startsWith("- "))
  : [];
const seen = state.changelogSeen ?? 0;
const fresh = cl.slice(seen);
if (fresh.length) {
  out.push(`\n## 契約の新しい変更 ${fresh.length}件`);
  out.push(...fresh);
  todo.push("契約が変わった → 自分の担当への影響を確認し `npm run typecheck`");
}
state.changelogSeen = cl.length;

// 6. GitHub
const gh = (args) => {
  const r = sh(`gh ${args}`, { allowFail: true });
  try {
    return r ? JSON.parse(r) : null;
  } catch {
    return null;
  }
};
if (hasRemote && me) {
  const login = me.github;
  // 同じ GitHub アカウントを複数人で使う場合（リハーサル等）: Issue は member:<id> ラベル、PR はブランチ名の先頭 <id>/ で見分ける
  const shared = cfg.members.filter((m) => m.github.toLowerCase() === login.toLowerCase()).length > 1;
  const whose = shared ? `--label member:${me.id}` : `--assignee ${login}`;
  const issues = gh(`issue list ${whose} --state open --json number,title,labels --limit 10`);
  const reviews = shared
    ? me.id === cfg.members[0].id
      ? gh(`pr list --state open --json number,title --limit 20`) // 共有時は lead が全 PR を見る
      : []
    : gh(`pr list --search "review-requested:${login}" --json number,title --limit 10`);
  const mine = (
    gh(`pr list --author ${login} --json number,title,headRefName,statusCheckRollup --limit 30`) ?? []
  ).filter((pr) => !shared || pr.headRefName.startsWith(`${me.id}/`));
  const crs = gh(`issue list --label change-request --state open --json number,title --limit 20`);
  if (issues === null) out.push("\n## GitHub: 取得できず（`gh auth status` を確認）");
  else {
    out.push(`\n## GitHub`);
    out.push(`自分の Issue: ${issues.length ? issues.map((i) => `#${i.number} ${i.title}`).join(" / ") : "なし"}`);
    out.push(`レビュー依頼: ${reviews?.length ? reviews.map((r) => `#${r.number} ${r.title}`).join(" / ") : "なし"}`);
    for (const pr of mine ?? []) {
      const failed = (pr.statusCheckRollup ?? []).some((c) => ["FAILURE", "ERROR"].includes(c.conclusion ?? c.state));
      out.push(`自分の PR #${pr.number} ${pr.title}${failed ? "  ← CI 失敗" : ""}`);
      if (failed) todo.push(`PR #${pr.number} の CI 失敗を直す`);
    }
    if (crs?.length)
      out.push(`未決の change-request: ${crs.map((c) => `#${c.number} ${c.title}`).join(" / ")}（同期点で採否）`);
    // 合流（docs/rules/help.md）: 期限は「作成後の最初の同期点」まで
    const helps =
      gh(`issue list --label help --state open --json number,title,createdAt,assignees,labels --limit 20`) ?? [];
    for (const h of helps) {
      const mineHelp = shared
        ? h.labels?.some((l) => l.name === `member:${me.id}`)
        : h.assignees?.some((a) => a.login.toLowerCase() === login.toLowerCase());
      const due = cfg.milestones.find((m) => m.sync && new Date(m.at) > new Date(h.createdAt));
      const expired = due && new Date(due.at) <= now;
      out.push(
        `合流中 #${h.number} ${h.title}  期限: ${due ? `${fmtTime(due.at)} ${due.name}` : "なし"}${expired ? "  ← 期限切れ" : ""}`,
      );
      if (mineHelp && expired)
        todo.push(`合流 #${h.number} の期限が来た → 自分の担当に戻る（続けるなら同期点で決め直して Issue を作り直す）`);
    }
    if (reviews?.length) todo.push("レビュー依頼を先に処理する（他人を待たせない）");
    if (issues.some((i) => i.labels?.some((l) => l.name === "bug"))) todo.push("自分宛ての bug Issue を優先する");
  }
} else if (!hasRemote) {
  out.push("\n## GitHub: remote 未設定");
}

// 7. ステップ（完了はマージ済み PR のブランチ名から自動判定）
if (me) {
  const st = stepStates(me);
  if (st) {
    const mark = { done: "✓", pr: "…", wip: "▶", todo: "・" };
    out.push(`\n## ステップ（完了の判定: ${st.source}）`);
    for (const s of st.steps)
      out.push(
        `${mark[s.state]} ${s.id} ${s.text}${s.state === "pr" ? `（PR #${s.pr} マージ待ち）` : s.state === "wip" ? `（下書き PR #${s.pr} で作業中）` : ""}`,
      );
    out.push(
      `次のステップ: ${st.next ? `${st.next.id} ${st.next.text}` : `すべて完了またはマージ待ち → まとめ役（${cfg.facilitator ?? cfg.members[0].id}）に次の仕事をもらう`}`,
    );
  } else todo.push(`docs/members/${me.id}.md がない → _template.md から作る`);

  const decl = p(`.kit/declare-${me.id}.json`);
  if (!existsSync(decl) && branch !== "main")
    todo.push(
      "着手宣言がない → `npm run declare -- demoStep=… files=… screens=… contracts=…` で埋める（preflight も走る）",
    );

  // 契約と実装のすき間（scripts/lib/gaps.mjs）。第1統合までに埋める
  const g = gaps();
  const lead = isLead(cfg, me);
  if (lead && (g.routes.length || g.pages.length)) {
    out.push(
      `\n## 契約にあって中身がない: ${[...g.routes.map((r) => r.file), ...g.pages.map((s) => s.file)].join(", ")}`,
    );
    todo.push("`npm run kit:stub` で仮の API・画面を置き、契約と同じ PR に入れる（担当者を待たせない）");
  } else {
    const missing = [...g.routes.map((r) => r.file), ...g.pages.map((s) => s.file)];
    if (missing.length) {
      out.push(`\n## 契約にあって未実装（第1統合までに必要）: ${missing.join(", ")}`);
      todo.push(
        `未実装のうち自分の担当（docs/members/${me.id}.md）を作る（まずは MOCK=1 で fixtures を返すだけでよい）`,
      );
    }
  }
  if (g.flow.length && lead) {
    out.push(`\n## useFlow に受け渡しの欄がない型: ${g.flow.join(", ")}`);
    todo.push("screens.md の「受け取る / 渡す」に合わせて src/lib/flow.tsx に欄を足す（画面担当が待っている）");
  }
  const stubs = [...apiRoutes().map((r) => r.file), ...screenRows().map((s) => s.file)].filter((f) => isStub(f));
  if (stubs.length) {
    out.push(`\n## 仮のファイル（担当者が本物に置き換える）: ${stubs.join(", ")}`);
    todo.push(
      `仮のファイル ${stubs.length} 件のうち自分の担当を本物に置き換える（1 行目の KIT-STUB の印ごと書き換える）`,
    );
  }
}

// 8. 個人の作業ファイル（リポジトリの外。中身は出さず件数だけ）
const mine = me ? summary(me) : null;
if (mine) {
  out.push(`\n## 個人メモ: やること ${mine.todo} / 待ち ${mine.wait} / 行き詰まり ${mine.stuck}（npm run log）`);
  for (const l of mine.over)
    todo.push(
      `行き詰まりが30分を超えた: ${l.replace(/^- \[ \] \S+ \S+ /, "").slice(0, 60)} → 自分で直せないなら担当者に \`npm run issue -- bug <担当者id> "…"\`、決められないなら \`npm run issue -- blocked ${cfg.facilitator ?? cfg.members[0].id} "…"\`（解決したら npm run log -- done "…"）`,
    );
}

todo.unshift(...urgent);
// 準備がまだなら、何よりも先に（npm ci をせずに始めると hook・型チェック・doctor が全部失敗する）
if (
  !existsSync(p("node_modules/.package-lock.json")) ||
  sh("git config core.hooksPath", { allowFail: true }) !== ".githooks"
)
  todo.unshift(
    "このPCの準備がまだ（依存パッケージか git hooks がない）→ docs/kit/setup.md のとおり `npm run kit:setup -- <自分のid>`",
  );
if (stale.length)
  todo.push(
    `期限を1時間以上過ぎた自分のやること: ${stale.join(" / ")} → 終わっていれば Issue を閉じる。まだなら縮めるか、まとめ役に相談`,
  );
if (policy === "frozen") todo.push("フリーズ中: 新機能・契約変更はしない。デモ経路のバグと磨きだけ");
if (dirty > 0 && todo.length === 0) todo.push("完了確認が通っていれば commit → push → PR（1ステップ = 1PR）");
if (todo.length === 0) todo.push("次のステップに着手（着手宣言 → preflight → 実装 → 完了確認 → PR）");

out.push(`\n## やること（上から順に）`);
out.push(...todo.map((t, i) => `${i + 1}. ${t}`));

writeFileSync(statePath, JSON.stringify(state, null, 2));
console.log(out.join("\n"));
