// 契約と実装のずれを検査する（lead の所有）。
// 契約が先・実装が後: 第1統合（milestones の integrate）より前は、未実装の Route Handler / ページは警告だけ。
// 第1統合以降（または KIT_STRICT_CONTRACTS=1）は失敗にする。未実装の一覧は npm run now が担当者に出す。
import { existsSync, readFileSync } from "node:fs";
import { api } from "@contracts/api";
import { describe, expect, it } from "vitest";
import cfg from "../kit.config.json";

const integrate = cfg.milestones.find((m) => m.id === "integrate");
const strict = process.env.KIT_STRICT_CONTRACTS === "1" || (!!integrate && Date.now() >= Date.parse(integrate.at));

function check(file: string, pattern?: RegExp) {
  const ok = existsSync(file) && (!pattern || pattern.test(readFileSync(file, "utf8")));
  if (!ok && !strict) console.warn(`[未実装] ${file}（第1統合までに必要）`);
  if (strict) expect(ok, `${file} がない（または中身が足りない）`).toBe(true);
}

describe(`契約と実装（${strict ? "厳格" : "未実装は警告のみ"}）`, () => {
  it.each(Object.entries(api))("api.%s の Route Handler", (_name, route) => {
    check(`src/app${route.path}/route.ts`, new RegExp(`export const ${route.method}\\b`));
  });

  const screens = [...readFileSync("contracts/screens.md", "utf8").matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map(
    (m) => m[1],
  );
  it.each(screens)("画面 %s のページ", (id) => {
    check(`src/app/${id}/page.tsx`);
  });
});
