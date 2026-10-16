// npm install / npm ci の最後に自動で走る: git hooks を有効にする（Husky の `prepare` と同じ役割）。
// git の外（CI の tarball など）や失敗時は何もしない。
import { spawnSync } from "node:child_process";

const inGit = spawnSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" }).status === 0;
if (inGit) spawnSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
