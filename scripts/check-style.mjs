// npm run lint の一部 — 見た目の契約（contracts/tokens.css）を迂回する書き方を弾く。
//  - Tailwind の任意値: bg-[#fff] / p-[13px] / text-[15px] など
//  - style={{ ... }} の直書き
//  - tsx 内の色コード（#fff, rgb(...)）
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT } from "./lib/kit.mjs";

const RULES = [
  {
    re: /\b[a-z-]+-\[[^\]]*(#|\d+(px|rem|em|%)|rgb|hsl)[^\]]*\]/,
    msg: "Tailwind の任意値（tokens.css にある名前か標準の段階を使う）",
  },
  { re: /style=\{\{/, msg: "style の直書き（className と tokens を使う）" },
  { re: /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/, msg: "色コードの直書き（tokens.css に追加を依頼）" },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith(".tsx")) yield p;
  }
}

const errors = [];
for (const file of walk(join(ROOT, "src"))) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.includes("style-ok")) return; // どうしても必要な行は // style-ok と理由を書く
      for (const r of RULES) if (r.re.test(line)) errors.push(`${relative(ROOT, file)}:${i + 1}  ${r.msg}`);
    });
}

if (errors.length) {
  console.error(`✗ 見た目の契約違反 ${errors.length}件:\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log("✓ 見た目の契約違反なし");
