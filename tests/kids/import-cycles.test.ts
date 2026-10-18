// 部品の import の輪がないことのテスト（src/components・src/kids を通る輪）。
// 輪があると、端末（Metro）は開いたときに「Require cycle」と注意を出し、読み込みの途中の部品が空のまま使われることがある。
// 子ども用の見た目の振り分け（src/components/kids-switch.tsx・schedule/kids-switch.tsx・pair/kids-switch.tsx）は、
// 今の部品と新しい部品の両方を読むので輪を作りやすい。振り分けや写した部品（scripts/sync-kids-ui.mjs）を変えたら、ここで分かる。
// 見方: src/app/ の画面から、実際に読み込まれる import（`import type` など型だけのものは除く）をたどり、輪を探す。
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repo = path.resolve(__dirname, "..", "..");
const EXTS = [".tsx", ".ts", ".js", ".jsx", ".json"];

function resolveFile(base: string): string | null {
  for (const cand of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => path.join(base, `index${e}`))]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

// 行き先のファイル（このリポジトリの中のものだけ。パッケージは null）
function resolveSpec(spec: string, from: string): string | null {
  if (spec.startsWith(".")) return resolveFile(path.resolve(path.dirname(from), spec));
  if (spec.startsWith("@/")) return resolveFile(path.join(repo, "src", spec.slice(2)));
  if (spec.startsWith("@contracts/"))
    return resolveFile(path.join(repo, "contracts", spec.slice("@contracts/".length)));
  return null;
}

// 型だけの import・export は端末では消えるので数えない
function runtimeSpecs(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const c = node.importClause;
      const typeOnly =
        c?.isTypeOnly ||
        (c != null &&
          !c.name &&
          c.namedBindings != null &&
          ts.isNamedImports(c.namedBindings) &&
          c.namedBindings.elements.length > 0 &&
          c.namedBindings.elements.every((e) => e.isTypeOnly));
      if (!typeOnly) out.push(node.moduleSpecifier.text);
      return;
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const typeOnly =
        node.isTypeOnly ||
        (node.exportClause != null &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.length > 0 &&
          node.exportClause.elements.every((e) => e.isTypeOnly));
      if (!typeOnly) out.push(node.moduleSpecifier.text);
      return;
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0] as ts.Node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require"))
        out.push((node.arguments[0] as ts.StringLiteral).text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(p));
    else if (/\.(tsx?|jsx?)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const rel = (f: string) => path.relative(repo, f).split(path.sep).join("/");

// 画面から読み込まれる輪（強く結びついたまとまりごとに、輪の道を1つ）
function findCycles(entries: string[]): string[][] {
  const graph = new Map<string, string[]>();
  const stack = [...entries];
  while (stack.length > 0) {
    const f = stack.pop() as string;
    if (graph.has(f) || !/\.(tsx?|jsx?)$/.test(f)) continue;
    const next = runtimeSpecs(f)
      .map((s) => resolveSpec(s, f))
      .filter((x): x is string => x != null);
    graph.set(f, next);
    stack.push(...next);
  }
  // Tarjan の方法で、2つ以上のファイルが互いに読み合うまとまりを探す
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const st: string[] = [];
  const groups: string[][] = [];
  const strong = (v: string) => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    st.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!graph.has(w)) continue;
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v) as number, low.get(w) as number));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v) as number, idx.get(w) as number));
    }
    if (low.get(v) === idx.get(v)) {
      const g: string[] = [];
      let w: string;
      do {
        w = st.pop() as string;
        onStack.delete(w);
        g.push(w);
      } while (w !== v);
      if (g.length > 1 || (graph.get(v) ?? []).includes(v)) groups.push(g);
    }
  };
  for (const f of graph.keys()) if (!idx.has(f)) strong(f);
  // まとまりの中で、輪の道を1つ見つけて見せる
  return groups.map((g) => {
    const inGroup = new Set(g);
    const start = g.slice().sort()[0] as string;
    const prev = new Map<string, string>();
    const queue = [start];
    const seen = new Set([start]);
    while (queue.length > 0) {
      const v = queue.shift() as string;
      for (const w of graph.get(v) ?? []) {
        if (w === start) {
          const pathOut = [start];
          for (let x = v; x !== start; x = prev.get(x) as string) pathOut.splice(1, 0, x);
          return [...pathOut, start].map(rel);
        }
        if (inGroup.has(w) && !seen.has(w)) {
          seen.add(w);
          prev.set(w, v);
          queue.push(w);
        }
      }
    }
    return g.map(rel);
  });
}

describe("部品の import の輪", () => {
  it("画面から読み込む部品（src/components・src/kids）に輪がない", () => {
    const entries = listFiles(path.join(repo, "src", "app"));
    const cycles = findCycles(entries).filter((c) => c.some((f) => /^src\/(components|kids)\//.test(f)));
    expect(cycles.map((c) => c.join(" → "))).toEqual([]);
  });

  it("輪があれば見つけられる（確かめる道具が動いているか）", () => {
    // 振り分けの前の作り（index.ts → kids-switch.tsx → 今の日程の部品 → index.ts）と同じ形を、一時的なフォルダで作る
    const dir = fs.mkdtempSync(path.join(repo, "tests", "kids", ".cycle-"));
    try {
      fs.writeFileSync(path.join(dir, "index.ts"), 'export { A } from "./switch";\n');
      fs.writeFileSync(path.join(dir, "switch.tsx"), 'import { B } from "./b";\nexport const A = B;\n');
      fs.writeFileSync(
        path.join(dir, "b.tsx"),
        'import { A } from "./index";\nimport type { T } from "./t";\nexport const B = A;\n',
      );
      fs.writeFileSync(path.join(dir, "t.ts"), 'import { B } from "./b";\nexport type T = typeof B;\n');
      const cycles = findCycles([path.join(dir, "index.ts")]);
      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toHaveLength(4);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
