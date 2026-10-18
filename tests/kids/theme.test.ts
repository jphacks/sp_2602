// 子ども用の見た目の色の組（src/kids/theme/ … tmp/animations から写したもの）と、テーマの名前のつなぎ（src/kids/theme-names.ts）のテスト。
import { type ColorName, palettes } from "@contracts/tokens";
import { describe, expect, it } from "vitest";
import * as kidsStore from "@/kids/lib/theme-store";
import { kidsPalettes } from "@/kids/theme/themes";
import { kidsThemeOf } from "@/kids/theme-names";
import * as appStore from "@/lib/theme-store";

const colorPattern = /^(#[0-9A-Fa-f]{6}|rgba\(\d{1,3}, ?\d{1,3}, ?\d{1,3}, ?(0|1|0?\.\d+)\))$/;

describe("テーマの名前のつなぎ", () => {
  it("白色＝ホワイトボード・黒色＝黒板・ベージュ＝ノート", () => {
    expect(kidsThemeOf("light")).toBe("whiteboard");
    expect(kidsThemeOf("dark")).toBe("chalkboard");
    expect(kidsThemeOf("notebook")).toBe("notebook");
  });
});

describe("子ども用の色の組", () => {
  const names = Object.keys(palettes.light).sort() as ColorName[];
  it.each(Object.keys(kidsPalettes) as (keyof typeof kidsPalettes)[])(
    "%s は今の色の組と同じ名前を全部持ち、どれも端末が読める色",
    (theme) => {
      const p = kidsPalettes[theme];
      expect(Object.keys(p).sort()).toEqual(names);
      for (const n of names) expect(p[n], `${theme}.${n}`).toMatch(colorPattern);
    },
  );
});

describe("子ども用の theme-store の中継ぎ（src/kids/lib/theme-store.ts）", () => {
  it("配色の名前はアプリのものをそのまま出す（写した部品の「配色の変更」が読む）", () => {
    expect(kidsStore.COLOR_SCHEME_OPTIONS).toBe(appStore.COLOR_SCHEME_OPTIONS);
    expect(kidsStore.DEFAULT_COLOR_SCHEME).toBe(appStore.DEFAULT_COLOR_SCHEME);
    expect(kidsStore.colorSchemeLabel).toBe(appStore.colorSchemeLabel);
    expect(kidsStore.loadColorScheme).toBe(appStore.loadColorScheme);
    expect(kidsStore.saveColorScheme).toBe(appStore.saveColorScheme);
  });

  it("テーマの選択肢は子ども用の3つ（保護者の2つではない）", () => {
    expect(kidsStore.THEME_OPTIONS).toBe(appStore.KIDS_THEME_OPTIONS);
  });
});
