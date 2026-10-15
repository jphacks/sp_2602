// npm run kit:owners — kit.config.json から .github/CODEOWNERS を生成する。手で編集しない。
//   --check : 書き換えずに、今の CODEOWNERS が kit.config.json と合っているかだけ確かめる（npm run lint で使う）
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadConfig, p } from "./lib/kit.mjs";

const cfg = loadConfig();
const lead = cfg.members[0];
const lines = ["# 自動生成（npm run kit:owners）。編集は kit.config.json で。", `* @${lead.github}`];
// GitHub は「最後に一致した行」を使い、キット（ownerOf）は「members の前の人から順に最初に一致したもの、なければ共有」を使う。
// 同じ結果になるよう、優先の低い順（共有 → members の後ろの人 → 前の人）に並べる（例: src/server/route.ts は lead、src/server/*.ts は back-a）
// 共有ファイルは誰でも変更できるが、統合担当がレビューする
// 貸し出し（loans。npm run handoff）は載せない: 借りた人の PR のレビュー役は、元の持ち主のまま（自分の担当を手伝ってもらった中身を確かめる）
for (const g of cfg.shared ?? []) lines.push(`/${g.replace(/\/\*\*$/, "/")} @${lead.github}`);
for (const m of [...cfg.members].reverse())
  for (const g of m.owns) lines.push(`/${g.replace(/\/\*\*$/, "/")} @${m.github}`);
const text = `${lines.join("\n")}\n`;

if (process.argv.includes("--check")) {
  // 以前、owns を変えたのに生成し直さず、CODEOWNERS が古いまま残っていた（next-env.d.ts・docs/shots）
  const now = existsSync(p(".github/CODEOWNERS")) ? readFileSync(p(".github/CODEOWNERS"), "utf8") : "";
  if (now.replace(/\r\n/g, "\n") !== text) {
    console.error(
      "✗ .github/CODEOWNERS が kit.config.json と合っていない → lead が npm run kit:owners を実行して commit",
    );
    process.exit(1);
  }
  console.log("✓ CODEOWNERS は kit.config.json と一致");
  process.exit(0);
}
writeFileSync(p(".github/CODEOWNERS"), text);
console.log(`.github/CODEOWNERS を ${lines.length - 2} 行で生成`);
