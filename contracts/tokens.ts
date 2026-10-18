// デザイン契約（React Native 用のテーマ）。画面で使える色・余白・角丸・文字・寸法はここで定義したものだけ。
// 色コードはこのファイルの中だけに書く（画面・部品に "#…" を直書きしない。style={{…}} も書かない）。
//
// 色はテーマ（"light" = 白色 / "dark" = 黒色）ごとに2組ある（palettes.light・palettes.dark）。名前は同じで値だけが違う。
//   なぜ名前をそろえるか: 画面は「どの役目の色か」（bg・primary など）だけを書き、テーマを切り替えても画面のコードは変えずに済むようにするため。
//   ダークに抜けがあると型（ColorPalette）でも tests/lib/theme.test.ts でも落ちる。
//   画面・部品での使い方は src/lib/theme.tsx（makeStyles・useColors）。色以外（余白・文字・寸法）はテーマで変わらないので tokens のまま。
// 値の出どころ:
//   ライト: 色の3つ（bg・primary・primarySoft）は docs/MVP_SPEC.md 5章。それ以外は Figma「最新」の画面の見た目から近い値。
//   ダーク: Figma「ダーク」の画面（子01 112:13883・子02・子03・子04・子06・子11・子14・親01〜親04・親06・親16）の画像の色を読んだ値。
//           Figma のダークに出てこない色（danger・warning とその地）は、ダークの地の上で読める近い値を置いた。
//   寸法は Figma「最新」の画面（360×800）の書き出し。

// ライト（白色）。既定のテーマ
const light = {
  bg: "#FAF9FD", // 画面の背景（MVP_SPEC）
  surface: "#FFFFFF", // カード・入力欄の地
  surfaceDim: "#F3F2F8", // 下部タブ・薄い区切りの地
  primary: "#3B5BDB", // アクセント（MVP_SPEC）。青い文字・数字・アイコン・枠・スイッチ ON の地
  primaryFill: "#3B5BDB", // 面を塗るアクセント。主ボタン・進捗バー・今日の棒・円形ゲージの弧（上に白い文字が載る）
  primarySoft: "#DDE4FF", // 薄い青（MVP_SPEC）。次のテストのカード・タブの選択中・小さいボタン
  primaryMuted: "#A9B8F0", // グラフの「過去の日」の棒（今日より前）
  onPrimary: "#FFFFFF", // primaryFill の上の文字
  onPrimarySoft: "#1B2A6B", // primarySoft の上の文字（次のテストのカード）
  switchThumbOn: "#FFFFFF", // スイッチ ON のつまみ（primary の地の上）
  text: "#1B1B21", // 本文
  muted: "#5F5E6B", // 補足の文字
  line: "#C7C5D0", // カードの枠・区切り線（Figma のカード・リスト項目の 1px 枠）
  outline: "#777680", // 枠だけのボタン・ダイアログの丸いボタンの枠（Figma の outlined ボタン）
  track: "#E6E6EE", // 進捗バー・グラフの下地
  danger: "#B3261E", // エラー・上限到達
  dangerSoft: "#FBE4E2", // エラーの帯の地
  warning: "#8A5A00", // 古いキャッシュなど注意の文字
  warningSoft: "#FFF1D6", // 注意の帯の地
  success: "#1E7B4D", // 成功・反映済み
  successSoft: "#DDF3E7",
  dialog: "#F3EFF8", // ダイアログの地（Figma 子04・子06・子09・親07 の薄い紫）
  scrim: "rgba(27, 27, 33, 0.4)", // ダイアログの後ろの暗幕
  qrFg: "#1B1B21", // QR の黒い点（読み取りのため、ダークでも白地に黒のまま）
  qrBg: "#FFFFFF", // QR の白地
  white: "#FFFFFF", // テーマで変わらない白（カメラの読み取り枠・テーマの色見本）
  black: "#000000", // テーマで変わらない黒（カメラの地・テーマの色見本）
} as const;

export type ColorName = keyof typeof light;
// 1組の色。ライトとダークで名前が全部そろっていることを型で確かめる（足りない・余分な名前があると型のエラーになる）
export type ColorPalette = { readonly [K in ColorName]: string };

// ダーク（黒色）。Figma「ダーク」の画面から読んだ値
const dark: ColorPalette = {
  bg: "#121316", // 画面の背景
  surface: "#1E1F24", // カード・入力欄の地
  surfaceDim: "#26272C", // 下部タブ・期間の帯・注意書きの地
  primary: "#AEBDFF", // 青い文字・数字・アイコン・枠（「46」「詳しく見る」・選択中の枠・スイッチ ON の地）
  primaryFill: "#3B5BDB", // 主ボタン・進捗バー・今日の棒・円形ゲージの弧（ライトと同じ青）
  primarySoft: "#2D3B82", // 次のテストのカード・帯・タブの選択中・小さいボタンの地
  primaryMuted: "#5A6BB8", // グラフの「過去の日」の棒
  onPrimary: "#FFFFFF",
  onPrimarySoft: "#DDE4FF", // primarySoft の上の文字
  switchThumbOn: "#0B1F6B", // スイッチ ON のつまみ（Figma 親16 は明るい地に紺のつまみ）
  text: "#E4E2E6",
  muted: "#C7C5D0",
  line: "#46464F", // カード・リスト項目の枠・下部タブの上の線
  outline: "#938F99", // 入力欄・枠だけのボタン・スイッチ OFF の枠
  track: "#2F3036", // 進捗バー・グラフ・円形ゲージの下地
  danger: "#FFB4AB", // Figma のダークにないので、暗い地で読める赤
  dangerSoft: "#601410",
  warning: "#F2C063", // Figma のダークにないので、暗い地で読める黄
  warningSoft: "#4A3300",
  success: "#7FD6A0", // Figma 子02「ちょうどいいペース！」・子04 のチェック
  successSoft: "#1F4A33",
  dialog: "#26272C", // ダイアログの地（Figma 子04・子06）
  scrim: "rgba(0, 0, 0, 0.33)", // Figma 子04 の暗幕（背景 #121316 が #0C0D0F になる濃さ）
  qrFg: "#1B1B21",
  qrBg: "#FFFFFF",
  white: "#FFFFFF",
  black: "#000000",
};

export type ThemeName = "light" | "dark";
export const palettes: Readonly<Record<ThemeName, ColorPalette>> = { light, dark };

export const tokens = {
  // 余白は 4px 刻み。space[4] = 16
  space: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 },
  // Figma の並びの決まり（digest-screens.md 4章）
  layout: {
    gutter: 24, // 画面の左右の余白（カード・ボタンは x=24・幅 312）
    contentTop: 8, // 上のバーの下から本文までの余白
    cardGap: 16, // カード同士・入力欄同士・縦に並ぶボタン同士の間隔
    listGap: 12, // リストの項目同士・ダイアログの主ボタンと副ボタンの間隔
    cardPadding: 20, // カードの内側の余白（Figma は 20〜21）
    dialogPadding: 24, // ダイアログの内側の余白
    dialogWidth: 312, // ダイアログの幅
    bottomGap: 24, // 画面の下端の主ボタンと、タブ（または画面の下端）の間
  },
  radius: { sm: 8, md: 12, card: 16, dialog: 28, pill: 999 },
  // 文字の大きさ（Figma の書き出しに文字の大きさが入っていないため、文字枠の高さから決めた）
  font: { xxs: 10, xs: 12, sm: 14, base: 16, lg: 18, xl: 22, xxl: 28, display: 48, ring: 64 },
  lineHeight: { xxs: 14, xs: 16, sm: 20, base: 24, lg: 26, xl: 30, xxl: 36, display: 56, ring: 74 },
  weight: { regular: "400", medium: "500", semibold: "600", bold: "700" },
  // 部品の寸法（Figma）
  size: {
    touch: 44, // 押せる部品の高さの下限（Android の推奨 48dp に近い 44 を基準にする）
    button: 56, // 全幅のボタンの高さ
    buttonSmall: 34, // 「詳しく見る」などの小さいボタンの高さ
    textButton: 40, // ダイアログの文字だけのボタン（OK・キャンセル）
    pillMinWidth: 70, // 枠付きの丸いボタン（pill）の幅の下限（Figma 子04 の「OK」）
    appBar: 64, // 上のバー
    tabBar: 80, // 下部タブ
    tabIndicatorWidth: 64,
    tabIndicatorHeight: 32,
    field: 64, // 入力欄
    listItem: 66, // リストの項目（1行）
    listItemTall: 86, // リストの項目（2行）
    icon: 24,
    iconSmall: 20,
    iconLarge: 32,
    iconBadge: 96, // QR・連携の画面の大きいアイコンの丸
    iconBadgeGlyph: 48,
    spinner: 56,
    progressTrack: 12, // 進捗バーの太さ
    appBarTrack: 8, // アプリ別の利用時間のバーの太さ（親09）
    ring: 240, // 円形ゲージ（子02）
    ringStroke: 20, // 円形ゲージの線の太さ
    qr: 200, // QR 本体
    qrFrame: 242, // QR の外枠
    viewfinder: 240, // QR を読む枠（親11）
    chartBarWidth: 28, // 棒グラフの棒の幅
    chartHeight: 140, // 棒グラフの高さ（親01 の track の最大 135 前後）
    chartHeightSmall: 90, // 棒グラフの高さ（子02「今週の使用割合」の track 90）
    chartTagWidth: 72, // 棒の下の札（「今の試験」）が1行で入る幅。棒の列より広く、左右にはみ出す
    switchWidth: 52,
    switchHeight: 32,
    switchThumbOn: 24, // スイッチのつまみ（ON。白・大）
    switchThumbOff: 16, // スイッチのつまみ（OFF。グレー・小）
    switchBorder: 2, // スイッチ OFF の枠の太さ
    appIcon: 40, // アプリの頭文字のアイコン（親16）
    legendSwatch: 10, // グラフの凡例の色見本
    border: 1, // 枠線の太さ
  },
} as const;

export type Tokens = typeof tokens;
