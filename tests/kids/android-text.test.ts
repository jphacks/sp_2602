// 子ども用の文字が Android で切れないことのテスト（決まりは src/kids/fonts.ts の「Android で字が切れないための決まり」）。
//   - letterSpacing は Android では外す（上のバーの「Slope」が「Slop」になったため）
//   - 写した部品のスタイル（書体・大きさ・行の高さ）を src/kids のソースから集め、字の形が行の箱の上下からはみ出さないこと
//     （ログインしないと出ない画面の文字も、ここで確かめる。文字はどのテーマでも BIZ UDPGothic、上のバーのロゴ「Slope」だけ Londrina Solid。D-134）
//   - 書体の高さの表（KIDS_FONT_METRICS）が、assets/fonts の TTF の値と合っていること
import fs from "node:fs";
import path from "node:path";
import { tokens } from "@contracts/tokens";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  androidTextPatch,
  INK_OVERFLOW_TOLERANCE,
  inkOverflow,
  KIDS_FONT_FACES,
  KIDS_FONT_METRICS,
  type KidsFontFace,
} from "@/kids/fonts";

const repo = path.resolve(__dirname, "..", "..");

describe("letterSpacing（Android）", () => {
  it("字の間を付けているスタイルは、Android では 0 に戻す", () => {
    expect(androidTextPatch({ fontSize: 30, letterSpacing: 0.3 })).toEqual({ letterSpacing: 0 });
    expect(androidTextPatch({ fontSize: 30, letterSpacing: -0.5 })).toEqual({ letterSpacing: 0 });
  });
  it("付けていなければ何もしない", () => {
    expect(androidTextPatch({ fontSize: 30 })).toBeNull();
    expect(androidTextPatch({ letterSpacing: 0 })).toBeNull();
    expect(androidTextPatch(undefined)).toBeNull();
  });
});

describe("行の高さと字の形のはみ出し", () => {
  it("行の高さが書体の高さより十分あれば、はみ出さない", () => {
    expect(inkOverflow("LondrinaSolid-Black", 30, 40)).toEqual({ top: 0, bottom: 0 });
    expect(inkOverflow("BIZUDPGothic-Bold", 22, undefined)).toEqual({ top: 0, bottom: 0 });
    // BIZ UDPGothic は書体の高さがちょうど 1em なので、行の高さが字の大きさと同じならはみ出さない
    expect(inkOverflow("BIZUDPGothic-Bold", 56, 56)).toEqual({ top: 0, bottom: 0 });
  });
  it("Londrina Solid は、数字だけなら下に出ない（「p」は下に出る）", () => {
    expect(inkOverflow("LondrinaSolid-Black", 56, 58, "46").bottom).toBe(0);
    expect(inkOverflow("LondrinaSolid-Black", 56, 58, "Slope").bottom).toBeGreaterThan(INK_OVERFLOW_TOLERANCE);
    expect(inkOverflow("LondrinaSolid-Black", 30, 35, "Slope")).toEqual({ top: 0, bottom: 0 });
  });
  it("行の高さを字の大きさより小さくすると、BIZ UDPGothic の上下（濁点・「g」）がはみ出す", () => {
    const o = inkOverflow("BIZUDPGothic-Bold", 22, 18);
    expect(o.bottom).toBeGreaterThan(INK_OVERFLOW_TOLERANCE);
    expect(o.top).toBeGreaterThan(INK_OVERFLOW_TOLERANCE);
  });
});

// ── 写した部品のスタイルを集める ──
// 書体を「...fonts.body・...fonts.bold・...fonts.logo」（src/kids/theme/tool.ts の fonts を広げたもの）か、
// 「fontFamily: fonts.body.fontFamily」（太さはほかのスタイルが決める）で指定したオブジェクトで、
// fontSize と lineHeight が数か tokens.font.X・tokens.lineHeight.X のもの
const FACES_OF: Record<string, KidsFontFace[]> = {
  body: ["BIZUDPGothic-Regular"],
  bold: ["BIZUDPGothic-Bold"],
  family: ["BIZUDPGothic-Regular", "BIZUDPGothic-Bold"],
  logo: ["LondrinaSolid-Black"],
};

function numberOf(expr: ts.Expression | undefined): number | undefined {
  if (!expr) return undefined;
  if (ts.isNumericLiteral(expr)) return Number(expr.text);
  const m = /^tokens\.(font|lineHeight)\.(\w+)$/.exec(expr.getText());
  if (m) return (tokens[m[1] as "font" | "lineHeight"] as Record<string, number>)[m[2] as string];
  return undefined;
}

function roleOf(obj: ts.ObjectLiteralExpression): string | undefined {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText() === "fontFamily") {
      if (/^fonts\.(body|bold)\.fontFamily$/.test(p.initializer.getText())) return "family";
    }
    if (ts.isSpreadAssignment(p)) {
      const m = /^fonts\.(body|bold|logo)$/.exec(p.expression.getText());
      if (m) return m[1];
    }
  }
  return undefined;
}

type Found = { file: string; role: string; fontSize: number; lineHeight: number };
function collectStyles(): Found[] {
  const out: Found[] = [];
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith(".tsx")) {
        const sf = ts.createSourceFile(p, fs.readFileSync(p, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const visit = (node: ts.Node) => {
          if (ts.isObjectLiteralExpression(node)) {
            const role = roleOf(node);
            const prop = (name: string) =>
              node.properties.find(
                (q): q is ts.PropertyAssignment => ts.isPropertyAssignment(q) && q.name.getText() === name,
              )?.initializer;
            const fontSize = numberOf(prop("fontSize"));
            const lineHeight = numberOf(prop("lineHeight"));
            if (role && fontSize != null && lineHeight != null)
              out.push({ file: path.relative(repo, p).split(path.sep).join("/"), role, fontSize, lineHeight });
          }
          ts.forEachChild(node, visit);
        };
        visit(sf);
      }
    }
  };
  walk(path.join(repo, "src", "kids"));
  return out;
}

// ロゴの書体（Londrina Solid）は上のバーの「Slope」にしか使わない（下の「ロゴの書体は…」で確かめる）。「p」が下に出るので「Slope」の字の上下で見る。
// BIZ UDPGothic の文字は、何が入るか分からないので全部の字の上下で見る
function sampleText(s: Found): string | undefined {
  return s.role === "logo" ? "Slope" : undefined;
}

describe("写した部品の文字（src/kids）", () => {
  const styles = collectStyles();

  it("書体・大きさ・行の高さを集められている（ロゴ・大きな数字・見出し・本文）", () => {
    // 集め方が壊れて0件になったら気づくように、今ある代表を確かめる
    const has = (role: string, fontSize: number, lineHeight: number) =>
      styles.some((s) => s.role === role && s.fontSize === fontSize && s.lineHeight === lineHeight);
    expect(has("logo", 30, 35)).toBe(true); // 上のバーの「Slope」
    expect(has("bold", 56, 58)).toBe(true); // ホームの「46」
    expect(has("bold", tokens.font.ring, tokens.lineHeight.ring)).toBe(true); // 円の中の「100」
    expect(has("bold", tokens.font.xl, tokens.lineHeight.xl)).toBe(true); // 題名
    expect(has("body", tokens.font.base, tokens.lineHeight.base)).toBe(true); // 本文
    expect(styles.length).toBeGreaterThan(20);
  });

  it("ロゴの書体（Londrina Solid）は、上のバーのアプリ名「Slope」（Screen.tsx）だけに使う", () => {
    const logos = styles.filter((s) => s.role === "logo").map((s) => s.file);
    expect(logos).toEqual(["src/kids/components/Screen.tsx"]);
  });

  it("どの道具の書体でも、字の形が行の箱の上下からはみ出さない（Android は切れる）", () => {
    const bad: string[] = [];
    for (const s of styles) {
      for (const face of FACES_OF[s.role] ?? []) {
        const o = inkOverflow(face, s.fontSize, s.lineHeight, sampleText(s));
        if (o.top > INK_OVERFLOW_TOLERANCE || o.bottom > INK_OVERFLOW_TOLERANCE)
          bad.push(`${s.file}: ${face} ${s.fontSize}/${s.lineHeight}（上 ${o.top}・下 ${o.bottom} dp）`);
      }
    }
    expect(bad).toEqual([]);
  });
});

// ── 書体の高さの表と TTF ──
function readTable(buf: Buffer, tag: string): number {
  const num = buf.readUInt16BE(4);
  for (let i = 0; i < num; i++) {
    const rec = 12 + i * 16;
    if (buf.toString("latin1", rec, rec + 4) === tag) return buf.readUInt32BE(rec + 8);
  }
  throw new Error(`${tag} がない`);
}

describe("書体の高さの表（KIDS_FONT_METRICS）", () => {
  it("ascent・descent は TTF の hhea の値（1em あたり）と同じ", () => {
    for (const face of Object.keys(KIDS_FONT_FACES) as KidsFontFace[]) {
      const buf = fs.readFileSync(path.join(repo, "assets", "fonts", `${face}.ttf`));
      const unitsPerEm = buf.readUInt16BE(readTable(buf, "head") + 18);
      const hhea = readTable(buf, "hhea");
      const ascent = buf.readInt16BE(hhea + 4) / unitsPerEm;
      const descent = -buf.readInt16BE(hhea + 6) / unitsPerEm;
      expect(KIDS_FONT_METRICS[face].ascent, face).toBeCloseTo(ascent, 3);
      expect(KIDS_FONT_METRICS[face].descent, face).toBeCloseTo(descent, 3);
      // 字の形の上下は、書体の高さの中か、少しだけ外（全部の字の外枠 head の yMax・yMin より内側）
      const yMax = buf.readInt16BE(readTable(buf, "head") + 42) / unitsPerEm;
      const yMin = -buf.readInt16BE(readTable(buf, "head") + 38) / unitsPerEm;
      expect(KIDS_FONT_METRICS[face].inkTop, face).toBeLessThanOrEqual(yMax);
      expect(KIDS_FONT_METRICS[face].inkBottom, face).toBeLessThanOrEqual(yMin);
    }
  });
});
