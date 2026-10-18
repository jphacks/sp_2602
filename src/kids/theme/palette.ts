// tmp/animations/rnweb/whiteboard/theme/palette.ts から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// ホワイトボード（白色・ほうろうの白板とボードマスター）の色の組。
// contracts/tokens.ts の ColorPalette と同じ名前が全部そろっている（足りない・余分な名前があると型のエラーになる）。
// アプリに入れるときは、この1組を tokens.ts の palettes に足す（名前はそのまま。値だけがホワイトボードのもの）。
// 値の出どころ: Figma「UI子供用」の区画「白色（ホワイトボードとマーカー）」34:2138 と、変数「Slope 紙と黒板」のモード 22:0。
// 色の意味の決まり（kids-design-rules.md）:
//   - 文字・枠・主ボタン・アイコン＝ink（黒のマーカー）。エラー・注意・成功も ink（赤はテストの色なのでエラーに使わない。緑も使わない）
//   - 使った時間（緑マーカー）・テスト（赤マーカー）・道筋のうすい線は、今の名前にないので tool.ts の marker に置く
//   - カード・帯・入力欄は地を塗らない（ボードに直接書く）。だから「〜Soft」の地は、ボードの地と同じ色にする
import type { ColorPalette } from "@contracts/tokens";

const ink = "#262626"; // 黒のマーカー（文字・枠）
const board = "#EEF1F2"; // ほうろうの白板（JIS S 6052 の白に近い、少し青みの白）

export const whiteboard: ColorPalette = {
  bg: board, // 画面の地
  surface: board, // カード・入力欄の地（塗らない＝ボードのまま）
  surfaceDim: "#DADDE1", // 押している間の行・ペン置きの色に近い地（Figma の変数 surfaceDim）
  primary: ink, // アクセント。ホワイトボードでは黒のマーカー（青は使わない）
  primaryFill: ink, // 主ボタンの地（黒の地に白い文字）
  primarySoft: board, // 薄い地（次のテストのカード・帯）。塗らないのでボードのまま
  primaryMuted: "#9FA5AB", // 過去の日など、一段うすいもの（BarChart の過去の日はマーカーの不透明度で出すので、ほぼ使わない）
  onPrimary: board, // 主ボタンの文字（Figma: 黒の地にボードの白 #EEF1F2）
  onPrimarySoft: ink, // 薄い地の上の文字
  switchThumbOn: "#FFFFFF", // スイッチ ON のつまみ（ink の地の上）
  text: ink, // 本文
  muted: "#4D5257", // 補足の文字（白板の上で読める濃さ）
  line: ink, // カードの枠・区切り（黒のマーカー）
  outline: ink, // 線だけのボタン・入力欄の線
  track: "#C9CDD2", // 道筋のうすい線（上限までの道。点線にしない）
  danger: ink, // エラーも ink＋アイコンで伝える（赤はテストの色）
  dangerSoft: board,
  warning: ink,
  warningSoft: board,
  success: ink, // 成功のチェックは黒のマーカー
  successSoft: board,
  dialog: board, // ダイアログ＝ボードの白の板にマーカーの枠（Figma の画像の地も #EEF1F2）
  scrim: "rgba(27, 27, 33, 0.4)", // ダイアログの後ろの暗幕（今のまま）
  qrFg: "#1B1B21", // QR は読み取りのため、どのモードでも白い紙に黒
  qrBg: "#FFFFFF",
  white: "#FFFFFF",
  black: "#000000",
};
