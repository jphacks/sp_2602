// 上のバーのアプリ名は、どの画面でも「Slope」だけ（「（子）」「（親）」を添えない。D-132）。
// 前はログイン画面（ログアウトしたあとの、親子どちらにも出る画面）でも「Slope（子）」と出ていた。
// 画面のコード（src/app）と上のバーの部品（Screen.tsx）の、コメントを除いた中身に「（子）」「（親）」が無いことを確かめる
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repo = path.resolve(__dirname, "../..");

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

// 行のコメント（// …）と JSX のコメント（{/* … */}）・ブロックのコメントを除く
const code = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ""))
    .join("\n");

describe("アプリ名の横に（子）（親）を出さない（D-132）", () => {
  const targets = [
    ...files(path.join(repo, "src", "app")),
    path.join(repo, "src", "kids", "components", "Screen.tsx"),
    path.join(repo, "src", "components", "Screen.tsx"),
  ];

  it("画面と上のバーの部品のコードに「（子）」「（親）」がない", () => {
    const found = targets.filter((p) => /（[子親]）|\([子親]\)/.test(code(fs.readFileSync(p, "utf8"))));
    expect(found.map((p) => path.relative(repo, p))).toEqual([]);
    expect(targets.length).toBeGreaterThan(20);
  });

  it("子ども用の上のバー（Screen.tsx）は、アプリ名の読み上げも「Slope」だけ", () => {
    const screen = code(fs.readFileSync(path.join(repo, "src", "kids", "components", "Screen.tsx"), "utf8"));
    expect(screen).toContain('accessibilityLabel="Slope"');
    expect(screen).not.toMatch(/usePathname|useWho/);
  });
});
