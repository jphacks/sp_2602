// npm run kit:owners — kit.config.json から .github/CODEOWNERS を生成する。手で編集しない。
//   --check : 書き換えずに、今の CODEOWNERS が kit.config.json と合っているかだけ確かめる（npm run lint で使う）
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadConfig, p } from "./lib/kit.mjs";

const cfg = loadConfig();
const lead = cfg.members[0];
const lines = ["# 自動生成（npm run kit:owners）。編集は kit.config.json で。", `* @${lead.github}`];
for (const m of cfg.members) for (const g of m.owns) lines.push(`/${g.replace(/\/\*\*$/, "/")} @${m.github}`);
// 共有ファイルは誰でも変更できるが、統合担当がレビューする
for (const g of cfg.shared ?? []) lines.push(`/${g.replace(/\/\*\*$/, "/")} @${lead.github}`);
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
