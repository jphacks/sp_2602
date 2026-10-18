// tmp/animations/rnweb/whiteboard/theme/pencil.ts から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// ノート（ベージュ・MD ノートとトンボ 8900・マイルドライナー・赤ペン）の色の組と、鉛筆と蛍光ペンの道具の値。
//   notebook   … contracts/tokens.ts の ColorPalette と同じ名前が全部そろった1組（アプリに入れるときは tokens.ts の palettes に足す）
//   pencil     … 道具だけで使う色（鉛筆の各部・蛍光ペン・赤ペン・罫）。あとで tokens.ts に名前を付けて足す前提
//   pencilTool … theme/tool.ts の ToolValues と同じ形（components/ はこの形で読む。tools/pencil.tsx が描き方と組にする）
// 値の出どころ: Figma「UI子供用」の区画「ベージュ（ノートと鉛筆・蛍光ペン）」34:2166（shots/note/figma/*.png から読んだ値）、
// 変数「Slope 紙と黒板」のノートのモード 23:0（rnweb/themes/palette.ts に写した値）、確認ページ（rnweb/themes/parts.tsx の NotePencilBar・Highlighter）。
// 表現の決め方（なぜその形・その速さか）は pencil/EXPRESSION.md。
// 色の意味の決まり（kids-design-rules.md）:
//   - 文字・枠・主ボタン・アイコン＝芯の色（ink）。エラー・注意・成功も芯の色（赤はテストの色なのでエラーに使わない。緑も使わない）
//   - 使った時間＝緑の仲間（鉛筆の軸 #525735・数字 #246D47・蛍光ペンの緑）。テスト＝ピンクの蛍光ペンと赤ペン
//   - カード・帯・入力欄は地を塗らない（紙に直接書く）。だから「〜Soft」の地は紙と同じ色
import type { ColorPalette } from "@contracts/tokens";
import type { ToolValues } from "./tool";

const lead = "#3C3C3C"; // トンボ 8900 HB の芯（文字・枠）。黒ではなく黒鉛の灰色
const paper = "#ECE2CD"; // MD ノートのクリームの紙

// 道具の色（鉛筆の各部・蛍光ペン・赤ペン・罫）
export const pencil = {
  lead, // 芯（文字・枠・チェック・くるくる）
  paper,
  axis: "#525735", // 鉛筆の軸（今日・使った割合）。トンボ 8900 の深い緑
  axisPast: "#AAAE8C", // 過去の日の鉛筆の軸（色のうすい鉛筆。Figma 子02 から読んだ色）
  wood: "#CBA785", // 削った木
  eraser: "#F1A9A0", // 消しゴム
  ferrule: "#CBCAC3", // 金具
  limit: "#8D8A82", // 上限の点線（鉛筆で引いた点線）
  rule: "#A7AEB9", // 罫線（青みの灰色）
  usedText: "#246D47", // 使った割合の数字（濃い緑。Figma 子01 の「46」）
  highlightGreen: "#A8C48B", // マイルドグリーン（数字の後ろの帯）
  highlightGreenLine: "#A5B37A", // 太い線で引いた緑（円・上限の帯・タブ。Figma の画像では紙と重なって少し深い緑に見える）
  highlightPink: "#F7A3B8", // マイルドピンク（テストの日付）
  redPen: "#BB1643", // 赤ペン（あと 13 日 の数字）
  tabLine: "#545454", // 下のタブの上の線（定規で引いたまっすぐな線）
  cardPaper: "rgba(236, 226, 205, 0.55)", // カードの中の半透明の紙（中の罫を薄くする）
  shade: "rgba(0, 0, 0, 0.12)", // 鉛筆の軸の影の側（六角形の下の面）
} as const;

export const notebook: ColorPalette = {
  bg: paper, // 画面の地（クリームの紙。罫線は道具の Backdrop が描く）
  surface: paper, // カード・入力欄の地（塗らない＝紙のまま）
  surfaceDim: "#E1D6BE", // 押している間の行・線のボタン（紙を少し押した色）
  primary: lead, // アクセント。ノートでは芯の色（青は使わない）
  primaryFill: lead, // 主ボタンの地（芯の色の地にクリームの文字）
  primarySoft: paper, // 薄い地（次のテストのカード・帯）。塗らないので紙のまま
  primaryMuted: "#A9A391", // 一段うすいもの（過去の日などは道具の色で描くので、ほぼ使わない）
  onPrimary: paper, // 主ボタンの文字（クリーム）
  onPrimarySoft: lead,
  switchThumbOn: paper, // スイッチ ON のつまみ（芯の色の地の上）
  text: lead, // 本文
  muted: "#5C584F", // 補足の文字（紙の上で読める濃さ）
  line: "#545454", // 区切り（鉛筆の線）
  outline: lead, // 線だけのボタン・入力欄の線
  track: pencil.limit, // 上限までの道（鉛筆の点線）
  danger: lead, // エラーも芯の色＋アイコン（赤はテストの色）
  dangerSoft: paper,
  warning: lead,
  warningSoft: paper,
  success: lead, // 成功のチェックも鉛筆
  successSoft: paper,
  dialog: paper, // ダイアログ＝ノートを切り取った紙（中の罫は道具の Frame が描く）
  scrim: "rgba(27, 27, 33, 0.4)", // ダイアログの後ろの暗幕（今のまま）
  qrFg: "#1B1B21", // QR は読み取りのため、どのモードでも白い紙に黒
  qrBg: "#FFFFFF",
  white: "#FFFFFF",
  black: "#000000",
};

// 線の太さ（px）
export const pencilStroke = {
  frame: 1.5, // 鉛筆の枠（kids-design-round2.md 2-4）
  frameStrong: 2.0, // なぞり直した枠（入力中・エラー・選んだテーマ）。太さよりも2本目の線で強くする
  frameSmall: 1.2, // 小さい札
  button: 1.5, // 線だけの丸いボタン（ButtonLine が描く。ないときの borderWidth にも使う）
  buttonPressed: 1.8,
  badge: 1.2, // 大きいアイコンの丸の線
  ringPencil: 1.3, // 円の鉛筆の線
  ringBand: 20, // 円の蛍光ペン（tokens.size.ringStroke と同じ）
  limit: 1, // 点線
  check: 1.4, // チェック（24 の箱のとき）
  spinner: 3, // くるくるの弧
  tab: 3.2, // タブの蛍光ペン（1本ずつ）
  reached: 8, // 上限の帯の蛍光ペン
} as const;

// 動きの時間（ミリ秒）。EXPRESSION.md の「速さのまとめ」
export const pencilTiming = {
  barDelay: 280, // 鉛筆のバー（確認ページで自分で動かすとき。ふつうは ProgressBar が決める）
  barDuration: 800,
  numberMarkAt: 1080, // 数字の緑の蛍光ペン: 開いたときに start を渡すときの待ち（数え上げのあと = 280 + 800）。数え終わったときに start を渡すなら 0
  highlight: 360, // 蛍光ペンを一息で引く
  markAt: 1170, // テストの日付のピンクの蛍光ペン（カードが出てから）
  twiceGap: 160, // 近いとき: もう一度なぞるまで
  twice: 300,
  reachedDelay: 300, // 上限の帯の蛍光ペン
  reached: 420,
  ringLag: 80, // 円の蛍光ペンが鉛筆を追いかける遅れ（時定数）
  spin: 1200, // くるくる1周（鉛筆は紙をこするので、マーカーより少しゆっくり）
  breathe: 1600, // くるくるの弧の伸び縮み（片道）
  checkDelay: 120, // チェック: 出てから
  checkRing: 260, // 丸を書く
  checkGap: 40,
  check: 300, // チェックを書く
  tabGo: 130, // タブの蛍光ペン: 行き
  tabBack: 120, // 戻り
  field: 200, // 入力欄のなぞり直し・エラーの文
  select: 200, // テーマの選択
} as const;

// 書体はほかのモードと同じ（theme/tool.ts の fonts。前は見出しだけ Klee One SemiBold だった。D-134）

// ノートの道具の値の組
export const pencilTool: ToolValues = {
  name: "pencil",
  colors: {
    ...pencil,
    ink: lead,
    used: pencil.axis, // 使った時間の道具（鉛筆の軸）
    usedText: pencil.usedText,
    usedLine: pencil.highlightGreenLine, // 選んでいるタブの蛍光ペン
    test: pencil.highlightPink, // テストの印（ピンクの蛍光ペン）。文字の色には使わない
    // testText（印を付けた日付の文字の色）は置かない＝日付は芯の色のまま（印は後ろのピンクの蛍光ペン）
    testCount: pencil.redPen, // 残りの日数の数字（あと 13 日 の「13」）の色＝赤ペン（NextTestCard が読む）
    path: pencil.limit, // 上限までの道（鉛筆の点線）
    usedPast: pencil.axisPast, // 過去の日（凡例の色見本も同じ色）
  },
  stroke: pencilStroke,
  // 角 4・揺れ 0.8（kids-design-round2.md 2-4）
  frame: { radius: 4, wobble: 0.8 },
  // 点線の箱をカードの中の幅いっぱいに（Figma 子01: 箱は左右の余白 20 の内側いっぱい）。芯の先（8px）だけは見せる
  usedBar: { insetLeft: 0, insetRight: 0, minLength: 8 },
  timing: pencilTiming,
  chart: { heightSmall: 118 }, // 週の棒の場所（Figma ノートの子02 は鉛筆を立てるので約 118。土台の担当が足した）
};
