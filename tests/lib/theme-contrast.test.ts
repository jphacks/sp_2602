// 白色・黒色のどちらのテーマでも、文字・枠・つまみが地に溶けて見えなくならないことの確かめ（contracts/tokens.ts の palettes）。
// 比べ方は WCAG のコントラスト比。文字は 4.5 以上（大きい数字・太字の帯も同じにそろえる）、枠・つまみなど文字でない部品は 3 以上。
// 入力欄の「選んだ文字の両端のつまみ」は、色を省くと selectionColor（primarySoft）になり、どちらのテーマでも入力欄の地に溶けていた
// （TextField・DurationField で selectionHandleColor に primary を渡すようにした）。
import { type ColorName, palettes, type ThemeName } from "@contracts/tokens";
import { describe, expect, it } from "vitest";

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// [前の色, 地の色, 何に使うか]
const textPairs: [ColorName, ColorName, string][] = [
  ["text", "bg", "本文"],
  ["text", "surface", "カードの本文"],
  ["text", "dialog", "ダイアログの題名"],
  ["muted", "bg", "補足の文字"],
  ["muted", "surface", "カードの補足"],
  ["primary", "surface", "青い文字・数字"],
  ["onPrimary", "primaryFill", "主ボタンの文字"],
  ["onPrimarySoft", "primarySoft", "次のテストのカード・帯の文字"],
  ["danger", "dangerSoft", "エラーの帯"],
  ["warning", "warningSoft", "注意の帯"],
  ["success", "successSoft", "成功の帯"],
  ["danger", "bg", "入力欄のエラーの文"],
];

const partPairs: [ColorName, ColorName, string][] = [
  ["primary", "surface", "入力欄の選んだ文字のつまみ・カーソル"],
  ["outline", "surface", "入力欄・枠だけのボタンの枠"],
  // 進捗バー・今日の棒（primaryFill と track）は黒色で 2.3 しかない（Figma のダークの値。contracts は画面の係では変えないので報告にした）
];

describe.each(Object.keys(palettes) as ThemeName[])("テーマ %s", (name) => {
  const c = palettes[name];
  it.each(textPairs)("文字 %s が %s の上で読める（%s）", (fg, bg) => {
    expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(partPairs)("部品 %s が %s の上で見える（%s）", (fg, bg) => {
    expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(3);
  });
  it("選んだ文字の地（primarySoft）は入力欄の地に近く、つまみには使えない（だから primary を渡す）", () => {
    expect(contrast(c.primarySoft, c.surface)).toBeLessThan(3);
  });
});
