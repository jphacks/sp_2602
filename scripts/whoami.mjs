// npm run kit:whoami -- <id> — このPCで作業する自分を記録する（.kit-member は git 管理外）。
import { writeFileSync } from "node:fs";
import { currentMember, loadConfig, p } from "./lib/kit.mjs";

const cfg = loadConfig();
const id = process.argv[2];
if (!id) {
  const me = currentMember(cfg);
  console.log(me ? `${me.id}（${me.role}）` : "未設定");
  console.log(`候補: ${cfg.members.map((m) => m.id).join(", ")}`);
  process.exit(me ? 0 : 1);
}
if (!cfg.members.some((m) => m.id === id)) {
  console.error(`'${id}' は kit.config.json の members にない。候補: ${cfg.members.map((m) => m.id).join(", ")}`);
  process.exit(1);
}
writeFileSync(p(".kit-member"), `${id}\n`);
console.log(`自分 = ${id}`);
