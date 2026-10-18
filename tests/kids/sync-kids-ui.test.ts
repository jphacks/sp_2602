// 写す道具（scripts/sync-kids-ui.mjs）の import の書き換えの決まりのテスト。
// 確認ページ（tmp/animations/rnweb/whiteboard）の部品を、アプリの中（src/kids/）で同じように動かすための書き換え。
import { describe, expect, it } from "vitest";
import { rewriteSource, rewriteSpecifier } from "../../scripts/sync-kids-ui.mjs";

const ctx = {
  hasKidsComponent: (rel: string) => ["index", "Button", "child/NextTestCard", "pair", "schedule"].includes(rel),
  hasKidsLib: (rel: string) => ["theme-store", "text"].includes(rel),
};

describe("1つの import の行き先", () => {
  it("作り物の中からアプリの本物を読む @app-src は、アプリの本物（@/…）", () => {
    expect(rewriteSpecifier("@app-src/components/PopIn", ctx).spec).toBe("@/components/PopIn");
    expect(rewriteSpecifier("@app-src/components/pair/child-flow", ctx).spec).toBe("@/components/pair/child-flow");
  });

  it("@/components は、新しい部品があれば @/kids/components、なければアプリの元のもの", () => {
    expect(rewriteSpecifier("@/components", ctx).spec).toBe("@/kids/components");
    expect(rewriteSpecifier("@/components/Button", ctx).spec).toBe("@/kids/components/Button");
    expect(rewriteSpecifier("@/components/child/NextTestCard", ctx).spec).toBe("@/kids/components/child/NextTestCard");
    expect(rewriteSpecifier("@/components/pair", ctx).spec).toBe("@/kids/components/pair");
    expect(rewriteSpecifier("@/components/text-wrap", ctx).spec).toBe("@/components/text-wrap");
    expect(rewriteSpecifier("@/components/child/child-view", ctx).spec).toBe("@/components/child/child-view");
  });

  it("@/lib は、アプリ用の中継ぎ（src/kids/lib）があればそれ、なければアプリの本物（作り物は読まない）", () => {
    expect(rewriteSpecifier("@/lib/theme-store", ctx).spec).toBe("@/kids/lib/theme-store");
    expect(rewriteSpecifier("@/lib/theme", ctx).spec).toBe("@/lib/theme");
    expect(rewriteSpecifier("@/lib/session", ctx).spec).toBe("@/lib/session");
  });

  it("相対の import・パッケージ・contracts はそのまま", () => {
    expect(rewriteSpecifier("../../tools", ctx).spec).toBe("../../tools");
    expect(rewriteSpecifier("react-native-svg", ctx).spec).toBe("react-native-svg");
    expect(rewriteSpecifier("@contracts/tokens", ctx).spec).toBe("@contracts/tokens");
  });

  it("確認ページの作り物（stubs・scenes）を読んでいたら止める", () => {
    expect(rewriteSpecifier("../stubs/lib/theme", ctx).error).toBeDefined();
    expect(rewriteSpecifier("../scenes/kit", ctx).error).toBeDefined();
  });
});

describe("ファイルの書き換え", () => {
  it("react-native の Text・TextInput は書体を直す Text へ。ほかの名前と型はそのまま", () => {
    const src = [
      'import { Animated, StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";',
      'import type { TextStyle } from "react-native";',
      'import { Button } from "@/components/Button";',
      "export const x = 1;",
    ].join("\n");
    const out = rewriteSource(src, "components/X.tsx", ctx);
    expect(out.errors).toEqual([]);
    expect(out.text).toContain('import { Animated, StyleSheet, type TextInputProps, View } from "react-native";');
    expect(out.text).toContain('import { Text, TextInput } from "@/kids/lib/text";');
    expect(out.text).toContain('import type { TextStyle } from "react-native";');
    expect(out.text).toContain('import { Button } from "@/kids/components/Button";');
  });

  it("Text だけを読んでいたら、react-native の import はなくなる", () => {
    const out = rewriteSource('import { Text } from "react-native";\n', "a.tsx", ctx);
    expect(out.text.trim()).toBe('import { Text } from "@/kids/lib/text";');
  });

  it("export … from も書き換える。コメントの中の import の形は書き換えない", () => {
    const src = [
      '// 例: import { PopIn } from "@app-src/components/PopIn";',
      'export { PopIn } from "@app-src/components/PopIn";',
      'export * from "@app-src/components/schedule/logic";',
    ].join("\n");
    const out = rewriteSource(src, "components/index.ts", ctx);
    expect(out.text).toContain('// 例: import { PopIn } from "@app-src/components/PopIn";');
    expect(out.text).toContain('export { PopIn } from "@/components/PopIn";');
    expect(out.text).toContain('export * from "@/components/schedule/logic";');
  });
});
