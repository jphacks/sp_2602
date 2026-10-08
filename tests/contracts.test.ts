// 契約と実装のずれを検査する（lead の所有）。契約に API を足したのに Route Handler がない、画面表にあるのにページがない、を検出する。
import { existsSync, readFileSync } from "node:fs";
import { api } from "@contracts/api";
import { describe, expect, it } from "vitest";

describe("契約と実装", () => {
  it.each(Object.entries(api))("api.%s に Route Handler がある", (_name, route) => {
    const file = `src/app${route.path}/route.ts`;
    expect(existsSync(file), `${file} がない`).toBe(true);
    expect(readFileSync(file, "utf8")).toMatch(new RegExp(`export const ${route.method}\\b`));
  });

  const screens = [...readFileSync("contracts/screens.md", "utf8").matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map(
    (m) => m[1],
  );
  it.each(screens)("画面 %s にページがある", (id) => {
    expect(existsSync(`src/app/${id}/page.tsx`), `src/app/${id}/page.tsx がない`).toBe(true);
  });
});
