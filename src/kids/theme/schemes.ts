// tmp/animations/rnweb/whiteboard/theme/schemes.ts から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 配色（赤・緑・青）。3つのテーマ（ホワイトボード・黒板・ノート）のそれぞれで、「使った時間」と「テスト」の色の役目と、
// 選んでいるタブの下線の色だけを配色の色に替える（指示書「配色」の色の表が正。Figma の見本ボード Ab5JrWa2jpNYYVuaYPW0MN の変数
// 「配色・ホワイトボード」「配色・黒板」「配色・ノート」のモード 赤・緑・青 と同じ値）。
// 決まり:
//   - 使った時間とテストは同じ色の仲間で描き、形で分ける（使った時間＝塗り・棒・円・バー / テスト＝下線とちょん・丸囲み・カードの枠・蛍光ペン）
//   - 文字（ink）・地・枠・罫線・エラー（ink のまま）・QR・上限の線（path・limit）は配色で変えない
//   - 黒板の過去の日の棒は白チョークのまま（usedPast は変えない）
//   - 既定は緑（今のホワイトボード・ノートの使った時間の緑に近く、今の見た目からの変わり方が小さい）
// 部品はここを直接読まない。tools/index.tsx の useTool() が今の配色を当てた values を返すので、values.colors を読むだけ。
// 描き方（marker/・chalk/・pencil/）の中は tools/scheme-colors.ts の useToolColors(道具の名前) で読む。
// 新しく決めた色（表にない色。overlap・usedCore・usedOverlap・highlightLine）のコントラストは各行のコメントに書いた（WCAG の比）。
import type { ColorSchemeName } from "@/kids/lib/theme-store";
import { chalkTool } from "./chalk";
import { pencilTool } from "./pencil";
import type { KidsThemeName } from "./themes";
import { markerTool, type ToolName, type ToolValues } from "./tool";

type SchemeColors = Readonly<Record<string, string>>;

// ── ホワイトボード（マーカー。パイロット ボードマスター）── 地 #EEF1F2
// Figma の変数: primary（字の強さ）・primaryFill（太い線）・primaryMuted（過去の日）・accentPaper（マグネットシート）
const markerSchemes: Record<ColorSchemeName, SchemeColors> = {
  red: {
    usedText: "#BC1A33", // primary（地と 5.55）。使った時間の数字・アイコン
    usedLine: "#BC1A33", // 選んでいるタブの下線
    test: "#BC1A33", // テストの日付の下線とちょん（accent・accentLine）
    testText: "#BC1A33", // 印を付けた日付の文字（highlight）
    used: "#D42A45", // primaryFill（地と 4.39）。線・円・棒
    usedPast: "#E07A88", // primaryMuted（地と 2.53）。過去の日の棒と凡例
    overlap: "#B8253C", // 新しく決めた: 円が一周して重なった所＝used × 0.87（地と 5.49・used と 1.25）
    accentPaper: "#F7898D", // マグネットシート（黒字と 6.43。今はコードで使う所なし）
  },
  green: {
    usedText: "#246D47", // 地と 5.52
    usedLine: "#246D47",
    test: "#246D47",
    testText: "#246D47",
    used: "#1E9A5A", // 地と 3.18
    usedPast: "#5FAD80", // 地と 2.38
    overlap: "#1A864E", // 新しく決めた: used × 0.87（地と 4.05・used と 1.28）
    accentPaper: "#86CFA7",
  },
  blue: {
    usedText: "#3F4C9D", // 地と 6.77
    usedLine: "#3F4C9D",
    test: "#3F4C9D",
    testText: "#3F4C9D",
    used: "#3A62BE", // 地と 5.04
    usedPast: "#7E9BD6", // 地と 2.45
    overlap: "#3255A5", // 新しく決めた: used × 0.87（地と 6.21・used と 1.23）
    accentPaper: "#9EB8E4",
  },
};

// ── 黒板（チョーク。日本理化学のダストレスチョーク）── 地 #172420・一段明るい黒板 #1F2D28
// 使った時間とテストは同じ1本のチョーク（primary＝primaryFill）。過去の日の白チョーク（usedPast #D9DCD3）は変えない
const chalkSchemes: Record<ColorSchemeName, SchemeColors> = {
  red: {
    used: "#F4837F", // 地と 6.41・一段明るい黒板と 5.74
    usedText: "#F4837F",
    usedLine: "#F4837F",
    test: "#F4837F", // テストの丸・次のテストのカードの枠（accent・accentLine・accentCardLine・highlight）
    todayLabel: "#F4837F", // 週の棒の下の「今日」
    usedMuted: "#BD6B67", // primaryMuted（今はコードで使う所なし）
    usedCore: "#F2DACE", // 新しく決めた: 寝かせたチョークの芯の光＝used を #F2F0E2 へ 8 割寄せた色（used の上に重ねる飾り）
    usedOverlap: "#FAC1BF", // 新しく決めた: 一周して重なった所＝used と白の真ん中（地と 10.27。粉が重なって明るい）
  },
  green: {
    used: "#B9DE8A", // 地と 10.60
    usedText: "#B9DE8A",
    usedLine: "#B9DE8A",
    test: "#B9DE8A",
    todayLabel: "#B9DE8A",
    usedMuted: "#91B070",
    usedCore: "#E7ECD0", // 新しく決めた（作り方は赤と同じ）
    usedOverlap: "#DCEFC5", // 新しく決めた（地と 13.13）
  },
  blue: {
    used: "#86C0F0", // 地と 8.26
    usedText: "#86C0F0",
    usedLine: "#86C0F0",
    test: "#86C0F0",
    todayLabel: "#86C0F0",
    usedMuted: "#6A99BC",
    usedCore: "#DCE6E5", // 新しく決めた
    usedOverlap: "#C3E0F8", // 新しく決めた（地と 11.71）
  },
};

// ── ノート（ジェットストリーム・トンボ 8900・マイルドライナー）── 紙 #ECE2CD
// primary（ペンの字）・primaryFill（色鉛筆の軸）・primaryMuted（過去の日の軸）・primaryHighlight（蛍光ペン）。
// 数字の後ろの蛍光ペン（highlightGreen）とテストの日付の蛍光ペン（highlightPink）は、どちらも同じ配色の蛍光ペン（印は1画面に1つ）。
// 名前の highlightGreen・highlightPink は描き方の中の名前のまま（色はもう緑・ピンクとは限らない）。
const pencilSchemes: Record<ColorSchemeName, SchemeColors> = {
  red: {
    usedText: "#BB1643", // primary（紙と 4.93）。使った割合の数字
    testCount: "#BB1643", // 「あと 13 日」の数字（testInk）
    redPen: "#BB1643",
    used: "#A3203A", // primaryFill（紙と 5.78）
    axis: "#A3203A",
    usedPast: "#D9A3AE", // primaryMuted（紙と 1.67）
    axisPast: "#D9A3AE",
    highlightGreen: "#F7A3B8", // primaryHighlight（上の芯の字と 5.82）
    highlightPink: "#F7A3B8", // testHighlight
    test: "#F7A3B8",
    highlightGreenLine: "#EE9AA6", // 新しく決めた: 円・タブ・上限の帯の太い蛍光ペン＝蛍光ペンと「紙に重ねた色」の真ん中（紙と 1.66。元の緑 #A5B37A は 1.75）
    usedLine: "#EE9AA6",
  },
  green: {
    usedText: "#246D47", // 紙と 4.87
    testCount: "#246D47",
    redPen: "#246D47",
    used: "#525735", // 紙と 5.89
    axis: "#525735",
    usedPast: "#A9AC8C", // 紙と 1.82
    axisPast: "#A9AC8C",
    highlightGreen: "#A8C48B", // 上の芯の字と 5.88
    highlightPink: "#A8C48B",
    test: "#A8C48B",
    highlightGreenLine: "#A5B37A", // 今の値のまま（紙と 1.75。今の見た目を変えない）
    usedLine: "#A5B37A",
  },
  blue: {
    usedText: "#22509E", // 紙と 6.03
    testCount: "#22509E",
    redPen: "#22509E",
    used: "#3A5A9E", // 紙と 5.21
    axis: "#3A5A9E",
    usedPast: "#A4B0CE", // 紙と 1.69
    axisPast: "#A4B0CE",
    highlightGreen: "#9CC6E6", // 上の芯の字と 6.20
    highlightPink: "#9CC6E6",
    test: "#9CC6E6",
    highlightGreenLine: "#96BBD0", // 新しく決めた（作り方は赤と同じ。紙と 1.58）
    usedLine: "#96BBD0",
  },
};

const tables: Record<ToolName, Record<ColorSchemeName, SchemeColors>> = {
  marker: markerSchemes,
  chalk: chalkSchemes,
  pencil: pencilSchemes,
};

// 知らない配色の名前（壊れた保存の値など）は既定の緑
const known = (s: ColorSchemeName): ColorSchemeName => (s === "red" || s === "blue" ? s : "green");

// 当てた結果を覚えておく（同じ道具・同じ配色なら、いつも同じ値の組。useMemo の依存やスタイルの覚え場所が毎回変わらないように）
const cache = new WeakMap<ToolValues, Map<ColorSchemeName, ToolValues>>();

// 道具の値に配色を当てる。色の役目のうち表にあるものだけを替え、ほかの色・太さ・時間はそのまま（書体は道具の値に持たない。theme/tool.ts の fonts）
export function withScheme(values: ToolValues, scheme: ColorSchemeName): ToolValues {
  const s = known(scheme);
  let byScheme = cache.get(values);
  if (!byScheme) {
    byScheme = new Map();
    cache.set(values, byScheme);
  }
  let out = byScheme.get(s);
  if (!out) {
    out = { ...values, colors: { ...values.colors, ...tables[values.name][s] } };
    byScheme.set(s, out);
  }
  return out;
}

// 道具の名前 → 配色を当てる前の値
const baseValues: Record<ToolName, ToolValues> = { marker: markerTool, chalk: chalkTool, pencil: pencilTool };

// 道具の名前と配色から、配色を当てた値（描き方の中で道具が決まっているときに使う）
export function schemedValues(name: ToolName, scheme: ColorSchemeName): ToolValues {
  return withScheme(baseValues[name], scheme);
}

// テーマの名前 → 道具（アプリの "light"・"dark" と、確認ページの名前の両方）
function toolOfTheme(theme: KidsThemeName | string): ToolName {
  if (theme === "chalkboard" || theme === "dark") return "chalk";
  if (theme === "notebook" || theme === "note") return "pencil";
  return "marker";
}

// 「配色の変更」のダイアログの丸の色見本: 今のテーマで、その配色の「使った時間の色」（used）
export function schemeSwatch(theme: KidsThemeName, scheme: ColorSchemeName): string {
  return schemedValues(toolOfTheme(theme), scheme).colors.used;
}
