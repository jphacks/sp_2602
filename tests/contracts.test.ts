// 契約と実装のずれを検査する（lead の所有）。規則は scripts/lib/gaps.mjs と同じ。
// 契約が先・実装が後: 第1統合（milestones の integrate）より前は警告だけ。第1統合以降（または KIT_STRICT_CONTRACTS=1）は失敗。
// すき間は lead が npm run kit:stub で「仮のファイル」を置けば埋まる。未実装の一覧は npm run now が担当者に出す。
import { existsSync, readFileSync } from "node:fs";
import { api } from "@contracts/api";
import { describe, expect, it } from "vitest";
import cfg from "../kit.config.json";

const integrate = cfg.milestones.find((m) => m.id === "integrate");
const strict = process.env.KIT_STRICT_CONTRACTS === "1" || (!!integrate && Date.now() >= Date.parse(integrate.at));

function check(ok: boolean, what: string) {
  if (!ok && !strict) console.warn(`[未実装] ${what}（第1統合までに必要。lead は npm run kit:stub）`);
  if (strict) expect(ok, what).toBe(true);
}

const rows = readFileSync("contracts/screens.md", "utf8")
  .split("\n")
  .filter((l) => /^\| `[a-z0-9-]+` \|/.test(l))
  .map((l) => {
    const c = l.split("|").map((s) => s.trim());
    const types = (cell = "") => [...cell.matchAll(/\b[A-Z][A-Za-z0-9]+\b/g)].map((m) => m[0]);
    return { id: c[1]?.replaceAll("`", "") ?? "", types: [...types(c[4]), ...types(c[6])] };
  });

describe(`契約と実装（${strict ? "厳格" : "未実装は警告のみ"}）`, () => {
  it.each(Object.entries(api))("api.%s の Route Handler", (_name, route) => {
    const file = `src/app${route.path}/route.ts`;
    const ok = existsSync(file) && new RegExp(`export const ${route.method}\\b`).test(readFileSync(file, "utf8"));
    check(ok, `${file} がない（または ${route.method} を export していない）`);
  });

  it.each(rows.map((r) => r.id))("画面 %s のページ", (id) => {
    check(existsSync(`src/app/${id}/page.tsx`), `src/app/${id}/page.tsx がない`);
  });

  const flow = readFileSync("src/lib/flow.tsx", "utf8");
  const flowTypes = [...new Set(rows.flatMap((r) => r.types))];
  it.each(flowTypes)("画面間で受け渡す %s が useFlow にある", (t) => {
    check(
      new RegExp(`\\b${t}\\b`).test(flow),
      `src/lib/flow.tsx に ${t} の受け渡しの欄がない（screens.md の受け取る / 渡す）`,
    );
  });
});
