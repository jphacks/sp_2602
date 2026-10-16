// pre-commit で使う: コミット予定の変更に「競合マーカーの残り」「機密ファイル」「テストの削除・skip」がないかを検査する。
// 例外: テストを意図して消すときは KIT_ALLOW_TEST_CHANGE=1 を付ける（理由を PR に書く）。
import { findConflictMarkers, findTestSkips, isSecretPath, isTestPath } from "./lib/guard.mjs";
import { sh } from "./lib/kit.mjs";

const list = (cmd) => sh(cmd, { allowFail: true })?.split("\n").filter(Boolean) ?? [];
const errors = [];

const added = list("git diff --cached --name-only --no-renames --diff-filter=ACMR");
const deleted = list("git diff --cached --name-only --no-renames --diff-filter=D");

for (const f of added.filter(isSecretPath))
  errors.push(`機密ファイルらしいものがステージされている: ${f}（.gitignore に入れ、雛形は *.example にする）`);

for (const f of added) {
  const lines = (sh(`git diff --cached -U0 --no-renames -- "${f}"`, { allowFail: true }) ?? "")
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1));
  if (findConflictMarkers(lines).length > 0) errors.push(`競合マーカーが残っている: ${f}（解決してから add し直す）`);
  if (isTestPath(f) && findTestSkips(lines).length > 0 && process.env.KIT_ALLOW_TEST_CHANGE !== "1") {
    errors.push(`テストを飛ばす・絞る書き方（skip / only / todo）が追加されている: ${f}（テストを消して通さない）`);
  }
}
if (process.env.KIT_ALLOW_TEST_CHANGE !== "1") {
  for (const f of deleted.filter(isTestPath))
    errors.push(
      `テストファイルが削除されている: ${f}（意図した削除なら KIT_ALLOW_TEST_CHANGE=1 を付け、理由を PR に書く）`,
    );
}

if (errors.length > 0) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
