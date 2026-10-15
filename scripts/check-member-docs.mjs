// docs/members/<id>.md に書いたフォルダ・ファイル名が、kit.config.json のどこかの担当（owns・shared）に当てはまるかを確かめる（npm run lint で使う）。
// キックオフで機能名を a / b から変えたのに説明書が古い名前のまま残り、AI が古いフォルダに作って check-scope で止められた（リハーサル6）。
// `<画面id>` のような書き換え前提の名前と、`*` を含む名前は確かめない。
import { existsSync, readFileSync } from "node:fs";
import { baseOwnerOf, loadConfig, p } from "./lib/kit.mjs";

const cfg = loadConfig();
const errors = new Set(); // 同じ説明書に同じ名前が何度出ても1回だけ
for (const m of cfg.members) {
  const file = `docs/members/${m.id}.md`;
  if (!existsSync(p(file))) continue;
  for (const [, path] of readFileSync(p(file), "utf8").matchAll(/`((?:src|tests)\/[^`\s<>*]*)`/g)) {
    // フォルダ（末尾が /）は、その中のファイル1つで確かめる
    const probe = path.endsWith("/") ? `${path}x.ts` : path;
    if (!baseOwnerOf(probe, cfg))
      errors.add(`${file}: \`${path}\` は kit.config.json のどの担当（owns・shared）にも当てはまらない`);
  }
}

if (errors.size) {
  console.error(`✗ 説明書に古いフォルダ名が残っている:\n  ${[...errors].join("\n  ")}`);
  console.error(
    "  → 機能名・画面 id を変えたら、docs/members/<id>.md のフォルダ名も同じ名前に書き換える（docs/rules/team.md「キックオフでの書き換え」）",
  );
  process.exit(1);
}
console.log("✓ 説明書（docs/members/）のフォルダ名は kit.config.json と一致");
