// 契約と実装のすき間を見つける（now / kit:stub で使う）。tests/contracts.test.ts も同じ規則で検査する。
//   routes : contracts/api.ts にあるのに Route Handler がない API
//   pages  : contracts/screens.md にあるのに page.tsx がない画面
//   flow   : screens.md の「前の画面から受け取る / 次の画面へ渡す」の型が src/lib/flow.tsx にない
import { existsSync, readFileSync } from "node:fs";
import { p } from "./kit.mjs";

export const STUB_MARK = "// KIT-STUB";

const read = (f) => (existsSync(p(f)) ? readFileSync(p(f), "utf8") : "");

// api.ts の各エントリ（kind → method → path の順に書く約束）
export function apiRoutes() {
  return [
    ...read("contracts/api.ts").matchAll(
      /(\w+):\s*\{\s*kind:\s*"(json|stream)",\s*method:\s*"(\w+)",\s*path:\s*"(\/api\/[^"]+)"/g,
    ),
  ].map((m) => ({ name: m[1], kind: m[2], method: m[3], path: m[4], file: `src/app${m[4]}/route.ts` }));
}

// screens.md の表: | id | 画面 | 担当 | 前の画面から受け取る | サーバとの通信 | 次の画面へ渡す | 遷移先 |
export function screenRows() {
  return read("contracts/screens.md")
    .split("\n")
    .filter((l) => /^\| `[a-z0-9-]+` \|/.test(l))
    .map((l) => {
      const c = l.split("|").map((s) => s.trim());
      const types = (cell = "") => [...cell.matchAll(/\b[A-Z][A-Za-z0-9]+\b/g)].map((m) => m[0]);
      return {
        id: c[1].replaceAll("`", ""),
        file: `src/app/${c[1].replaceAll("`", "")}/page.tsx`,
        receives: types(c[4]),
        passes: types(c[6]),
      };
    });
}

export function gaps() {
  const flow = read("src/lib/flow.tsx");
  const flowTypes = [...new Set(screenRows().flatMap((s) => [...s.receives, ...s.passes]))];
  return {
    routes: apiRoutes().filter((r) => !existsSync(p(r.file))),
    pages: screenRows().filter((s) => !existsSync(p(s.file))),
    flow: flowTypes.filter((t) => !new RegExp(`\\b${t}\\b`).test(flow)),
  };
}

export const isStub = (file) => read(file).startsWith(STUB_MARK);
