// npm run lint の一部 — 見た目の契約（contracts/tokens.ts）を迂回する書き方を弾く。
//  - style={{ ... }} の直書き（StyleSheet.create を使う）
//  - tsx 内の色コード（#fff, rgb(...)）
//  - 余白・角丸・文字・大きさの数字の直書き（padding: 13 など。tokens.space[4] のように名前で使う）
// 対象は src/app と src/components の .tsx（contracts/tokens.ts 自体は対象外）
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT } from "./lib/kit.mjs";

// 数字を直接書いてはいけない StyleSheet のプロパティ。値は tokens の名前経由だけ。
// 例外（意味が値そのものなので許す）: 0 / flex・opacity・zIndex など寸法でないもの（そもそも対象外）/ borderWidth: 1（細い線）
const SIZE_PROPS =
  "padding\\w*|margin\\w*|gap|rowGap|columnGap|border\\w*Radius|borderRadius|fontSize|lineHeight|letterSpacing|" +
  "width|height|minHeight|minWidth|maxHeight|maxWidth|top|left|right|bottom|start|end|inset\\w*|" +
  "borderWidth|border\\w+Width|elevation|shadowRadius";
const NUM_RE = new RegExp(`\\b(${SIZE_PROPS})\\s*:\\s*(-?\\d[\\d._]*)`, "g");

function numericViolations(line) {
  const out = [];
  for (const m of line.matchAll(NUM_RE)) {
    const n = Number(m[2].replaceAll("_", ""));
    if (n === 0) continue;
    if (m[1] === "borderWidth" && n === 1) continue;
    out.push(m[0]);
  }
  return out;
}

const RULES = [
  { test: (l) => /style=\{\s*\[?\s*\{/.test(l), msg: "style の直書き（StyleSheet.create の中で tokens の名前を使う）" },
  {
    test: (l) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(l),
    msg: "色コードの直書き（contracts/tokens.ts の tokens.color.* を使う。足りなければ追加を依頼）",
  },
  {
    test: (l) => numericViolations(l).length > 0,
    msg: "余白・角丸・文字・大きさの数字の直書き（tokens.space / radius / font / size の名前を使う。0 は可）",
  },
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith(".tsx")) yield p;
  }
}

const errors = [];
const TARGETS = ["src/app", "src/components"].map((d) => join(ROOT, d)).filter((d) => existsSync(d));
for (const file of TARGETS.flatMap((d) => [...walk(d)])) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.includes("style-ok")) return; // どうしても必要な行は // style-ok と理由を書く
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // コメント行は見ない
      for (const r of RULES) if (r.test(line)) errors.push(`${relative(ROOT, file)}:${i + 1}  ${r.msg}`);
    });
}

if (errors.length) {
  console.error(`✗ 見た目の契約違反 ${errors.length}件:\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log("✓ 見た目の契約違反なし");
