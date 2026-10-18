// 子ども用の見た目の色の組（src/kids/theme/ … tmp/animations から写したもの）と、テーマの名前のつなぎ（src/kids/theme-names.ts）のテスト。
import { type ColorName, palettes } from "@contracts/tokens";
import { describe, expect, it } from "vitest";
import { kidsPalettes } from "@/kids/theme/themes";
import { kidsThemeOf } from "@/kids/theme-names";

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
