// pre-commit で使う: ステージ済みファイルの整形・lint を自動で直して、直したファイルを add し直す（lint-staged 相当）。
// 一部だけステージした（未ステージの変更も残っている）ファイルは、勝手に全体を add しないよう直さず、検査だけに任せる。
import { spawnSync } from "node:child_process";

const git = (args) => spawnSync("git", args, { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
const staged = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
const partial = new Set(git(["diff", "--name-only"]));
const targets = staged.filter((f) => !partial.has(f));

if (targets.length > 0) {
  const biome = ["biome", "check", "--write", "--no-errors-on-unmatched", "--files-ignore-unknown=true"];
  // 直せない指摘は後段の検査が止めるので、ここでは終了コードを見ない
  spawnSync("npx", [...biome, ...targets], { stdio: "inherit", shell: process.platform === "win32" });
  spawnSync("git", ["add", "--", ...targets], { stdio: "inherit" });
}
if (partial.size > 0 && staged.some((f) => partial.has(f))) {
  console.log("ℹ 一部だけステージしたファイルは自動修正せず、検査だけ行う");
}
