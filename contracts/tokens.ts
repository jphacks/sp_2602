// デザイン契約（React Native 用のテーマ）。画面で使える色・余白・角丸・文字・寸法はここで定義したものだけ。
// 画面は StyleSheet.create の中で tokens.color.primary のように名前で使う（色コードや数字を画面に直書きしない。style={{…}} も書かない）。
// 値の出どころ: 色の3つ（bg・primary・primarySoft）は docs/MVP_SPEC.md 5章。寸法は Figma「最新」の画面（360×800）の書き出し。
//   それ以外の色（文字・線など）は Figma の画面の見た目から近い値を置いた。ダークテーマは MVP の後。
export const tokens = {
  color: {
    bg: "#FAF9FD", // 画面の背景（MVP_SPEC）
    surface: "#FFFFFF", // カード・入力欄の地
    surfaceDim: "#F3F2F8", // 下部タブ・薄い区切りの地
    primary: "#3B5BDB", // アクセント（MVP_SPEC）。主ボタン・数字・進捗バー
    primarySoft: "#DDE4FF", // 薄い青（MVP_SPEC）。次のテストのカード・タブの選択中・小さいボタン
    primaryMuted: "#A9B8F0", // グラフの「過去の日」の棒（今日より前）
    onPrimary: "#FFFFFF", // primary の上の文字
    onPrimarySoft: "#1B2A6B", // primarySoft の上の文字（次のテストのカード）
    text: "#1B1B21", // 本文
    muted: "#5F5E6B", // 補足の文字
    line: "#D9D8E3", // カードの枠・区切り線
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
    white: "#FFFFFF",
    black: "#000000",
  },
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
  font: { xs: 12, sm: 14, base: 16, lg: 18, xl: 22, xxl: 28, display: 48, ring: 64 },
  lineHeight: { xs: 16, sm: 20, base: 24, lg: 26, xl: 30, xxl: 36, display: 56, ring: 74 },
  weight: { regular: "400", medium: "500", bold: "700" },
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
    switchWidth: 52,
    switchHeight: 32,
    appIcon: 40, // アプリの頭文字のアイコン（親16）
    legendSwatch: 10, // グラフの凡例の色見本
    border: 1, // 枠線の太さ
  },
} as const;

export type Tokens = typeof tokens;
