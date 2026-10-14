// npm run kit:setup -- <自分のid> — clone した直後に1回。このPCで使える状態にする（手順と失敗したときは docs/kit/setup.md）。
// 依存パッケージを使わずに動くので、npm ci の前でも実行できる。何度実行してもよい（済んでいる手順は飛ばす）。
//   1. Node のバージョン（.nvmrc）  2. npm ci（依存が入っていない・package-lock.json より古いとき）
//   3. git hooks を有効化           4. 自分の id（.kit-member）
//   5. .env（なければ .env.example から作る。あれば触らない）   6. gh で GitHub を使えるか
//   7. GitHub から最新を取得（git fetch）                        8. npm run doctor（全部 ✓ になるか）
// 以前、npm ci をせずに npm run now から始めて、hook・型チェック・doctor が全部失敗して詰まった人がいたため、入口を1つにした。
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { currentMember, loadConfig, p, sh } from "./lib/kit.mjs";

const args = process.argv.slice(2);
const idArg = args.find((a) => !a.startsWith("--"));
const cfg = loadConfig();
const results = [];
const step = (name, ok, hint = "") => {
  results.push({ name, ok, hint });
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → ${hint}`}`);
  return ok;
};
// npm を子として動かす（出力はそのまま見せる）。Windows の npm は npm.cmd なので shell を通す
const npm = (cmd) => spawnSync(`npm ${cmd}`, { cwd: p(""), stdio: "inherit", shell: true }).status === 0;

// 1. Node
const want = Number(readFileSync(p(".nvmrc"), "utf8").trim().replace(/^v/, "").split(".")[0]);
const have = Number(process.versions.node.split(".")[0]);
if (
  !step(
    `Node ${want} 系`,
    have === want,
    `今は ${process.versions.node}。Node ${want} を入れてから、もう一度（人間の作業）`,
  )
)
  process.exit(1);

// 2. 依存。node_modules/.package-lock.json は npm ci / install が最後に入れた内容の記録。package-lock.json より古ければ入れ直す
const installed = p("node_modules/.package-lock.json");
const stale = !existsSync(installed) || statSync(installed).mtimeMs < statSync(p("package-lock.json")).mtimeMs;
if (stale) {
  console.log("… npm ci（依存パッケージを package-lock.json のとおりに入れる。数分かかる）");
  if (!step("npm ci", npm("ci"), "上のエラーを読む。EPERM なら npm run dev などを止めてから、もう一度"))
    process.exit(1);
} else step("依存パッケージは入っている", true);

// 3. git hooks（コミット前の検査）と作業用フォルダ
sh("git config core.hooksPath .githooks");
mkdirSync(p(".kit"), { recursive: true });
step(
  "git hooks を有効化",
  sh("git config core.hooksPath", { allowFail: true }) === ".githooks",
  "git が使えるか確かめる",
);

// 4. 自分
const ids = cfg.members.map((m) => m.id);
if (idArg) {
  if (!ids.includes(idArg)) {
    step("自分の id", false, `'${idArg}' は members にない。候補: ${ids.join(", ")}`);
    process.exit(1);
  }
  writeFileSync(p(".kit-member"), `${idArg}\n`);
}
const me = currentMember(cfg);
step(
  `自分 = ${me ? `${me.id}（${me.role}）` : "未設定"}`,
  !!me,
  `人間に役を聞いてから npm run kit:setup -- <id>（候補: ${ids.join(", ")}。推測で決めない）`,
);

// 5. .env（手元用の設定。本物のキーは人間が書く。ここでは作るだけで、中身は読まない・表示しない）
if (!existsSync(p(".env"))) copyFileSync(p(".env.example"), p(".env"));
step(".env がある（MOCK=1 なら AI のキーなしで開発できる）", existsSync(p(".env")), "cp .env.example .env");

// 6. GitHub（gh）。同じ PC で別のアカウントにログインしていると、招待されたリポジトリが「見つからない」になる
const login = sh("gh api user --jq .login", { allowFail: true });
const placeholder = !me || /^github-user-\d+$/.test(me.github);
step(
  `gh で GitHub を使える${login ? `（${login}）` : ""}`,
  !!login && (placeholder || login.toLowerCase() === me.github.toLowerCase()),
  login
    ? `kit.config.json の ${me.id} は ${me.github}。違うアカウントなら gh auth login で切り替える（人間の作業）`
    : "gh auth login（ブラウザでのログインが要るので人間の作業。Codex なら docs/kit/codex.md の GH_TOKEN）",
);

// 7. 最新の main を取得（自分の作業ファイルは変えない。取り込みは npm run now の案内に従う）
const hasRemote = !!sh("git remote get-url origin", { allowFail: true });
step(
  "GitHub から最新を取得（git fetch）",
  hasRemote && sh("git fetch -q origin", { allowFail: true }) !== null,
  hasRemote ? "ネットワークと gh のログインを確かめる" : "origin がない。clone し直す（git clone <URL>）",
);

// 8. doctor（ここまでが全部 ✓ のときだけ。起動確認まで含めて1〜2分）
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log(`\n✗ ${failed.length} 件が未完了。上の → を済ませてから、もう一度 npm run kit:setup`);
  process.exit(1);
}
console.log("\n… npm run doctor（このPCで開発できるかの最終確認）");
if (!npm("run -s doctor")) {
  console.log("\n✗ doctor に ✗ がある。→ のとおりに直して、もう一度 npm run kit:setup");
  process.exit(1);
}
console.log("\n✓ 準備完了。次: npm run now");
