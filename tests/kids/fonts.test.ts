// 子ども用の見た目の書体の名前の直し（src/kids/fonts.ts）のテスト。
// 写した部品は「書体の名前＋太さ」で書いている。Android は読み込んだ書体に太さを付けると字を機械で太らせるので、
// 太さごとのファイルの名前に直し、太さは付けない（normal）ことを確かめる。
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fontFaceFor, fontOverride, KIDS_FONT_FACES, weightOf } from "@/kids/fonts";
import { chalkTool } from "@/kids/theme/chalk";
import { pencilTool } from "@/kids/theme/pencil";
import { fonts, markerTool } from "@/kids/theme/tool";

describe("太さの読み方", () => {
  it("なし・normal は 400、bold は 700、数の文字はその数", () => {
    expect(weightOf(undefined)).toBe(400);
    expect(weightOf("normal")).toBe(400);
    expect(weightOf("bold")).toBe(700);
    expect(weightOf("700")).toBe(700);
    expect(weightOf(900)).toBe(900);
  });
});

describe("書体の名前と太さ → 読み込んだファイルの名前", () => {
  it("本文（BIZ UDPGothic）は 400 と 700 を分ける", () => {
    expect(fontFaceFor("BIZ UDPGothic", "400")).toBe("BIZUDPGothic-Regular");
    expect(fontFaceFor("BIZ UDPGothic", undefined)).toBe("BIZUDPGothic-Regular");
    expect(fontFaceFor("BIZ UDPGothic", "700")).toBe("BIZUDPGothic-Bold");
    expect(fontFaceFor("BIZ UDPGothic", "bold")).toBe("BIZUDPGothic-Bold");
    // 600 の字はない。近いほうの 700（同じだけ近いときは太いほう）
    expect(fontFaceFor("BIZ UDPGothic", "600")).toBe("BIZUDPGothic-Bold");
    expect(fontFaceFor("BIZ UDPGothic", "500")).toBe("BIZUDPGothic-Regular");
  });

  it("太さが1つだけの書体（ロゴの Londrina Solid）は、どの太さでもそのファイル", () => {
    expect(fontFaceFor("Londrina Solid", "900")).toBe("LondrinaSolid-Black");
    expect(fontFaceFor("Londrina Solid", "400")).toBe("LondrinaSolid-Black");
  });

  it("使わなくなった書体（Klee One・Yusei Magic）は読み込まないので直さない（D-134）", () => {
    expect(fontFaceFor("Klee One", "600")).toBeNull();
    expect(fontFaceFor("Yusei Magic", "400")).toBeNull();
  });

  it("知らない書体・書体なしは直さない（保護者の見た目・端末の既定の書体）", () => {
    expect(fontFaceFor(undefined, "700")).toBeNull();
    expect(fontFaceFor("sans-serif", "700")).toBeNull();
    expect(fontOverride({ fontSize: 14 })).toBeNull();
    expect(fontOverride(undefined)).toBeNull();
  });

  it("直すときは太さを付けない（Android で字を機械で太らせない）", () => {
    expect(fontOverride({ fontFamily: "BIZ UDPGothic", fontWeight: "700", fontSize: 16 })).toEqual({
      fontFamily: "BIZUDPGothic-Bold",
      fontWeight: "normal",
    });
  });
});

describe("書体のファイルとライセンス（assets/fonts/）", () => {
  const dir = path.resolve(__dirname, "../../assets/fonts");
  it("読み込む名前ごとに TTF のファイルがある（src/kids/font-files.ts が読む名前と同じ）", () => {
    for (const face of Object.keys(KIDS_FONT_FACES)) {
      const file = path.join(dir, `${face}.ttf`);
      expect(fs.existsSync(file), file).toBe(true);
      // TrueType の始まり（00 01 00 00）
      expect([...fs.readFileSync(file).subarray(0, 4)]).toEqual([0, 1, 0, 0]);
    }
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/kids/font-files.ts"), "utf8");
    for (const face of Object.keys(KIDS_FONT_FACES))
      expect(src).toContain(`"${face}": require("../../assets/fonts/${face}.ttf")`);
  });

  it("書体ごとに SIL Open Font License の文を置いている", () => {
    for (const name of ["BIZUDPGothic", "LondrinaSolid"]) {
      expect(fs.readFileSync(path.join(dir, `OFL-${name}.txt`), "utf8")).toContain(
        "SIL Open Font License, Version 1.1",
      );
    }
  });

  it("読み込まない書体のファイル・ライセンスの文を置いたままにしない（起動時に読む量・アプリの大きさを増やさない）", () => {
    const faces = Object.keys(KIDS_FONT_FACES);
    const ttf = fs.readdirSync(dir).filter((f) => f.endsWith(".ttf"));
    expect(ttf.sort()).toEqual(faces.map((f) => `${f}.ttf`).sort());
    const families = new Set(faces.map((f) => f.split("-")[0]));
    const ofl = fs.readdirSync(dir).filter((f) => f.startsWith("OFL-"));
    expect(ofl.sort()).toEqual([...families].map((f) => `OFL-${f}.txt`).sort());
  });
});

// 子どもの画面の書体は、どのテーマでも BIZ UDPGothic（Regular・Bold）。ロゴ「Slope」だけ Londrina Solid（D-134）
describe("子どもの画面の書体はテーマに依らず1つ", () => {
  it("fonts は BIZ UDPGothic の 400・700 と、ロゴの Londrina Solid 900 だけ", () => {
    expect(fonts).toEqual({
      body: { fontFamily: "BIZ UDPGothic", fontWeight: "400" },
      bold: { fontFamily: "BIZ UDPGothic", fontWeight: "700" },
      logo: { fontFamily: "Londrina Solid", fontWeight: "900" },
    });
    // どれも読み込んだファイルに直せる
    for (const f of Object.values(fonts)) expect(fontFaceFor(f.fontFamily, f.fontWeight)).not.toBeNull();
  });

  it("道具（ホワイトボード・黒板・ノート）の値に書体を持たない（テーマで書体が変わらない）", () => {
    for (const tool of [markerTool, chalkTool, pencilTool]) expect("fonts" in tool, tool.name).toBe(false);
  });

  // src/kids の部品は書体の名前を直接書かず、theme/tool.ts の fonts を使う。ロゴの書体は上のバーの「Slope」だけ
  it("部品は書体の名前を直接書かない。ロゴの書体は Screen.tsx の「Slope」だけ", () => {
    const kids = path.resolve(__dirname, "../../src/kids");
    const direct: string[] = [];
    const logo: string[] = [];
    const walk = (d: string) => {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(ent.name)) {
          const rel = path.relative(kids, p).split(path.sep).join("/");
          const src = fs.readFileSync(p, "utf8");
          // fonts.ts（名前の直し）と theme/tool.ts（fonts の定義）のほかは書かない
          if (!["fonts.ts", "theme/tool.ts"].includes(rel) && /fontFamily:\s*["'`]/.test(src)) direct.push(rel);
          if (/fonts\.logo\b/.test(src)) logo.push(rel);
        }
      }
    };
    walk(kids);
    expect(direct).toEqual([]);
    expect(logo).toEqual(["components/Screen.tsx"]);
  });
});
