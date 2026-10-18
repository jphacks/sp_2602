// tmp/animations/rnweb/whiteboard/theme/chalk.ts から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 黒板（黒色・学校の黒板と日本理化学のダストレスチョーク）の色の組 chalkboard と、チョークの道具の値 chalkTool。
// contracts/tokens.ts の ColorPalette と同じ名前が全部そろっている（アプリに入れるときは palettes に足す。アプリの今の "dark" を置き換える案）。
// 値の出どころ: Figma「UI子供用」の区画「黒色（黒板とチョーク）」34:2110 と、変数「Slope 紙と黒板」のモード 4:1（chalk-prelude の card・banner・dialog・
// primary・outline・field・badge・chip の決まり）、確認ページ（rnweb/themes/palette.ts・parts.tsx の ChalkBar・ChalkCircle）。
// 表現の理由は chalk/EXPRESSION.md。
// 色の意味の決まり（kids-design-rules.md）:
//   - 文字・枠・主ボタン・アイコン＝チョークの白（ink）。エラー・注意・成功も ink（ピンクはテストの色、黄は使った時間の色なので使わない）
//   - 使った時間＝黄チョーク、テスト＝ピンクのチョーク、上限＝点線の枠。今の名前にない色は下の chalk にまとめる（あとで tokens.ts に足す）
//   - カード・帯・ダイアログ・行は一段明るい黒板（surface）。入力欄・札は地を塗らない
import type { ColorPalette } from "@contracts/tokens";
import type { ToolValues } from "./tool";

const board = "#172420"; // 学校の黒板（JIS の黒板の緑をさらに暗くした色）
const surface = "#1F2D28"; // 一段明るい黒板（消したあとに粉が残った所）
const tray = "#13201C"; // 粉受け・押している間の地
const ink = "#F0F1E8"; // チョークの白（文字・枠・主ボタンの地）

// チョークの色と、描き方の中だけで使う色
export const chalk = {
  board,
  surface,
  tray,
  ink,
  line: "#C9D2C8", // カード・ダイアログ・行の枠の線（少し粉の薄いチョークの白）
  used: "#E9D88A", // 黄チョーク（使った時間の棒・円・下線・数字）
  usedPast: "#D9DCD3", // 白チョーク（過去の日の棒。Figma の変数 chalkPast）
  test: "#F29B9F", // ピンクのチョーク（テストの日付の丸・次のテストのカードの枠）
  limit: "#75867A", // 上限の点線の枠（Figma の変数 limitLine）
  usedCore: "#F2F0E2", // 寝かせたチョークの太い線の真ん中の光（Figma 子02 の円の芯。ほぼチョークの白）
  usedOverlap: "#F6EDC0", // 一周して重なった所（粉が重なって明るい）
  stickHi: "rgba(255, 255, 255, 0.28)", // 棒の光の当たる側
  stickShade: "rgba(0, 0, 0, 0.13)", // 棒の影の側
  trayLip: "#8A958C", // 粉受けの手前の縁（光る細い線）
  trayGroove: "#0A1714", // 縁の下の溝の影
  haze: "#F0F1E8", // 消し跡（白のごくうすいむら。画像の中で使う色と同じ）
  wood: "#BC8A55", // ウィジェットの木の枠（Figma 子12 の黒板。土台の担当が足した）
  woodGroove: "#0A1714", // 木の枠のすぐ内側の溝の影
} as const;

export const chalkboard: ColorPalette = {
  bg: board, // 画面の地
  surface, // カード・行の地（一段明るい黒板）
  surfaceDim: tray, // 押している間の行・下のタブの地（Figma の変数 surfaceDim）
  primary: ink, // アクセント（カーソルなど）もチョークの白。青は使わない
  primaryFill: ink, // 主ボタン＝チョークの白の地に黒板の色の文字（Figma 子08・子19）
  primarySoft: surface, // 薄い地（次のテストのカード・帯）＝一段明るい黒板
  primaryMuted: "#8E9A90", // 一段うすいもの
  onPrimary: board, // 主ボタンの文字
  onPrimarySoft: ink,
  switchThumbOn: board, // スイッチ ON のつまみ（チョークの白の地の上）
  text: ink,
  muted: "#C3CDC3", // 補足の文字（Figma の変数 muted）
  line: chalk.line,
  outline: ink, // 線だけのボタン・入力欄の線（Figma の outline・field は ink）
  track: chalk.limit, // 上限までの道（点線の枠の色）
  danger: ink, // エラーも ink＋アイコン（ピンクはテストの色）
  dangerSoft: surface,
  warning: ink,
  warningSoft: surface,
  success: ink, // 成功のチェックはチョークの白
  successSoft: surface,
  dialog: surface, // ダイアログ＝小さい黒板（一段明るい黒板）にチョークの枠
  scrim: "rgba(0, 0, 0, 0.3)", // Figma 子04: 地 #172420 が #101816 になる濃さ
  qrFg: "#1B1B21", // QR は読み取りのため、どのモードでも白い紙に黒
  qrBg: "#FFFFFF",
  white: "#FFFFFF",
  black: "#000000",
};

// 線の太さ（px）
export const chalkStroke = {
  frame: 1.25, // 枠の線（Figma の card・dialog・field・chip）
  frameStrong: 2, // 選んでいる・エラーの欄（強くなぞった線。Figma 子03-B・子06）
  button: 1.5, // 線だけの丸いボタン（Figma の outline）
  buttonPressed: 2,
  badge: 1.25, // 大きいアイコンの丸
  small: 1, // 行の中の小さい札
  stick: 16, // 寝かせたチョーク（使った割合）
  stickThin: 8,
  stickTrack: 24, // 点線の枠の高さ
  limit: 1.2, // 点線の枠の線
  ring: 12, // 子02 の円の太い線
  ringCore: 6, // 円の真ん中の光（Figma 子02-C: 真ん中のほぼ白い所が 6 くらい）
  column: 22, // 立てたチョーク
  columnBox: 29, // 週の棒の点線の枠の幅
  circle: 2.8, // テストの日付の丸
  circle2: 2.2, // 2周目
  check: 1.8, // チェック（24 の箱のとき。大きさに比例）
  spinner: 4.5, // くるくるの弧（Figma 子13）
  tab: 2.8, // タブの下線
  reached: 2.8, // 上限に達した帯の下線
} as const;

// 動きの時間（ミリ秒）。chalk/EXPRESSION.md の 2 章
export const chalkTiming = {
  barDelay: 280, // 使った割合: 開始（確認ページ）
  barDuration: 900, // 使った割合: 長さ（確認ページの黒板のバー）
  updateRatio: 0.66, // 取り直しは長さ × 0.66
  markAt: 1000, // テストの丸（カードが出始めてから。数え上げのあと）
  circle: 620,
  circle2After: 800, // twice: 2周目
  circle2: 480,
  reachedDelay: 300, // 上限に達した帯の下線
  reached: 520,
  ring: 900, // 子02 の円（motion.duration.fill）
  spin: 1200, // くるくる1周
  checkDelay: 120, // チェック: ダイアログが出てから
  check: 450, // 短い払い・止まり・長い払いの合計（3：1.4：4.6）
  field: 220, // 入力欄の線を強くなぞる・エラーの文
  select: 260, // テーマの選択
  highlight: 260, // タブの下線
} as const;

// 書体はほかのモードと同じ（theme/tool.ts の fonts。前は見出しだけ Klee One SemiBold だった。D-135）

export const chalkTool: ToolValues = {
  name: "chalk",
  colors: {
    ...chalk,
    ink, // 文字・枠
    used: chalk.used, // 使った時間の道具
    usedText: chalk.used, // 使った時間の数字（黄チョーク。Figma 子01 の「46」）
    usedLine: chalk.used, // 選んでいるタブの下線
    test: chalk.test,
    path: chalk.limit, // 上限（点線の枠）
    usedPast: chalk.usedPast, // 凡例の過去の日（白チョーク）
    todayLabel: chalk.used, // 週の棒の下の「今日」の曜日・日付（Figma 子02: 黄。BarChart がこの名前を読めば使える）
  },
  stroke: { ...chalkStroke },
  frame: { radius: 6, wobble: 0 }, // 定規で引いた線なので揺れない
  // 点線の枠はカードの中の幅いっぱい。チョークは枠の内側 4 から（ChalkStick が枠を左右 4 外へ広げて描く）
  usedBar: { insetLeft: 4, insetRight: 4, minLength: 13 },
  timing: { ...chalkTiming },
};
