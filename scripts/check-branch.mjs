// pre-commit で使う: main に直接コミットしない・ブランチ名が <自分のid>/… で始まる、を検査する。
// 例外: 初回コミット、または進行役・主催の操作として KIT_ALLOW_MAIN=1 を付けたとき。
import { currentMember, loadConfig, sh } from "./lib/kit.mjs";

if (sh("git rev-parse --verify -q HEAD", { allowFail: true }) === null) process.exit(0); // 初回コミット
if (process.env.KIT_ALLOW_MAIN === "1") process.exit(0);

const cfg = loadConfig();
const me = currentMember(cfg);
const branch = sh("git symbolic-ref --short HEAD", { allowFail: true }) ?? "";

if (branch === "main" || branch === "master") {
  console.error(`✗ ${branch} に直接コミットしようとしている。npm run step -- S<番号> でブランチを作ってから`);
  process.exit(1);
}
if (me && !branch.startsWith(`${me.id}/`)) {
  console.error(
    `✗ ブランチ名 ${branch} が ${me.id}/ で始まっていない（規則: ${me.id}/S<番号>-<名前>。npm run step で作れる）`,
  );
  process.exit(1);
}
