// npm run kit:setup — clone 直後に1回。git hooks を有効にし、作業用フォルダを作る。
import { mkdirSync } from "node:fs";
import { p, sh } from "./lib/kit.mjs";

sh("git config core.hooksPath .githooks");
mkdirSync(p(".kit"), { recursive: true });
console.log("git hooks を有効化しました。次: npm run kit:whoami -- <id> → npm run doctor");
