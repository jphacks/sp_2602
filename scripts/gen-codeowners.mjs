// npm run kit:owners — kit.config.json から .github/CODEOWNERS を生成する。手で編集しない。
import { writeFileSync } from "node:fs";
import { loadConfig, p } from "./lib/kit.mjs";

const cfg = loadConfig();
const lead = cfg.members[0];
const lines = ["# 自動生成（npm run kit:owners）。編集は kit.config.json で。", `* @${lead.github}`];
for (const m of cfg.members) for (const g of m.owns) lines.push(`/${g.replace(/\/\*\*$/, "/")} @${m.github}`);
// 共有ファイルは誰でも変更できるが、統合担当がレビューする
for (const g of cfg.shared ?? []) lines.push(`/${g.replace(/\/\*\*$/, "/")} @${lead.github}`);
writeFileSync(p(".github/CODEOWNERS"), `${lines.join("\n")}\n`);
console.log(`.github/CODEOWNERS を ${lines.length - 2} 行で生成`);
