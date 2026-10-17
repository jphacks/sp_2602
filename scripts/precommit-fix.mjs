// pre-commit で使う: ステージ済みファイルの整形・lint を自動で直して、直したファイルを add し直す（lint-staged 相当）。
// 一部だけステージした（未ステージの変更も残っている）ファイルは、勝手に全体を add しないよう直さず、検査だけに任せる。
// 日本語のファイル名（docs/design/ など）を git が "\343\201..." と書き換えないよう core.quotePath=false と -z で受け取り、
// biome は shell を通さず node で直接起動する（空白や & を含む名前でも崩れない）。
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const git = (args) =>
  spawnSync("git", ["-c", "core.quotePath=false", ...args, "-z"], { encoding: "utf8" })
    .stdout.split("\0")
    .filter(Boolean);
const staged = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
const partial = new Set(git(["diff", "--name-only"]));
const targets = staged.filter((f) => !partial.has(f));

if (targets.length > 0) {
  const biome = fileURLToPath(new URL("../node_modules/@biomejs/biome/bin/biome", import.meta.url));
  const args = ["check", "--write", "--no-errors-on-unmatched", "--files-ignore-unknown=true"];
  // 直せない指摘は後段の検査が止めるので、ここでは終了コードを見ない
  spawnSync(process.execPath, [biome, ...args, ...targets], { stdio: "inherit" });
  spawnSync("git", ["add", "--", ...targets], { stdio: "inherit" });
}
if (partial.size > 0 && staged.some((f) => partial.has(f))) {
  console.log("ℹ 一部だけステージしたファイルは自動修正せず、検査だけ行う");
}
