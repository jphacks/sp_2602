// tmp/animations/rnweb/whiteboard/theme/tool.ts から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 道具の値（色・線の太さ・書体・枠・時間）。道具ごとに1組（今はホワイトボードのマーカー markerTool だけ）。
// あとで黒板（チョーク）・ノート（鉛筆・蛍光ペン）を足すときは、同じ形（ToolValues）の組をこのファイルに足し、
// tools/ に描き方を足す（README の「道具を足すとき」）。
// 色の組（palette.ts）の名前にない色は、ここの colors にまとめる。アプリに入れるときは tokens.ts に足す前提
// （名前の案: markerUsed・markerUsedText・markerTest・markerPath・trayTop など。README の「アプリに入れるとき」）。
// 値の出どころ: Figma「白色（ホワイトボードとマーカー）」34:2138 の画面（shots/whiteboard/figma/*.png から読んだ値）と、
// 確認ページ（rnweb/themes/parts.tsx・ThemedHome.tsx・palette.ts）。食い違ったら Figma の値にしてある（コメントに書く）。

// 道具の名前（今は marker だけ。chalk・pencil はあとで足す）
export type ToolName = "marker" | "chalk" | "pencil";

// 1つの道具の値。components/ の部品は、道具に依らない「役目」の名前（colors.usedText など）だけを読む
export type ToolValues = {
  name: ToolName;
  // 役目の色: ink＝文字・枠 / used＝使った時間の道具 / usedText＝使った時間の数字 / usedLine＝選んでいるタブの下線 /
  //           test＝テストの印 / path＝上限までの道筋。そのほかの名前は、その道具の描き方の中だけで使う
  //   省略できる役目の色（ないときは部品が ink で描く）: testText＝印を付けた日付の文字（ホワイトボードは赤）/
  //           testCount＝「あと 13 日」の数字（ノートは赤ペン）
  colors: {
    ink: string;
    used: string;
    usedText: string;
    usedLine: string;
    test: string;
    path: string;
    usedPast: string;
  } & Record<string, string>;
  // 線の太さ（px）。役目の名前: frame（枠）・frameStrong（選んでいる・エラーの枠）・button（線だけの丸いボタン）・badge（大きいアイコンの丸）
  stroke: { frame: number; frameStrong: number; button: number; badge: number } & Record<string, number>;
  // 手描きの枠（角・揺れ）
  frame: { radius: number; wobble: number };
  // 使った割合のバーの置き場所（Figma の ProgressTrack の左右の空き）と、少しでも使ったときの最低の長さ
  usedBar: { insetLeft: number; insetRight: number; minLength: number };
  // 書体（見出し・本文・大きな数字）。headingWeight は見出しの太さ（Yusei Magic は太字がないので "400"・Klee One は SemiBold "600"。省くと "400"）
  fonts: { heading: string; body: string; number: string; headingWeight?: "400" | "600" };
  // 動きの時間（ミリ秒）。役目の名前: field（入力欄の線が太くなる・エラーの文）・select（テーマの選択）。そのほかは描き方の中で使う
  timing: { field: number; select: number } & Record<string, number>;
  // 週の棒の場所の高さ（省くと tokens: 子02 の小さいグラフ 90・ほか 140）。ノートは鉛筆を立てるので高い（Figma ノートの子02 は約 118）
  chart?: { heightSmall?: number; height?: number };
};

// ── ホワイトボード（マーカー）────────────────────────────────

// マーカーの色（パイロット ボードマスターに近い色）。
// 使った時間・テストの色（used・usedPast・usedText・usedLine・test・testText・overlap）は、useTool() が配色（赤・緑・青）の値に
// 替えてから部品に渡す（theme/schemes.ts）。ここの値は配色を入れる前の値（残してあるのは、元の見た目の記録のため）
export const marker = {
  ink: "#262626", // 黒（文字・枠・チェック・くるくる）
  used: "#2EB76E", // 緑（使った時間の線・円・棒）
  usedPast: "#84D1A9", // 過去の日の棒と凡例の色見本（配色では primaryMuted。前は used を不透明度 0.55 で引いていた）
  usedText: "#246D47", // 緑の数字（緑マーカーそのままでは白板の上で文字に薄いので濃い緑）
  usedLine: "#246D47", // 選んでいるタブの下線（Figma の TabBar は濃い緑 3。確認ページは #2EB76E 3.4 だったが Figma に合わせる）
  test: "#BC1A33", // 赤（テストの日付の下線とちょん）
  testText: "#BC1A33", // 印を付けた日付の文字（Figma 子01・子10。赤のマーカーで書いた字）。残りの日数の数字（testCount）は置かない＝ink
  path: "#C9CDD2", // 上限までの道筋のうすい線（点線にしない）
  trayTop: "#AEB4BB", // アルミのペン置きの上の縁
  trayFrom: "#E4E8EB", // ペン置きの地（上 → 下のグラデーション）
  trayMid: "#D7DBE0",
  trayTo: "#C8CDD3",
  overlap: "#27A262", // 円が一周して書き始めと重なった所（インクが重なって少し濃い）
} as const;

// 線の太さ（px）
export const stroke = {
  box: 2.3, // 手で4辺を引いた枠
  boxFocus: 3.2, // 選んでいる・エラーの入力欄（「線を太く」）
  button: 1, // 線だけの丸いボタン（Figma の画像では 1px の黒の線）
  bar: 13, // 使った割合の線（MarkerBar）
  barPath: 3, // 道筋のうすい線
  ring: 13, // 子02 の円
  ringPath: 3,
  column: 18, // 週の棒
  columnPath: 3,
  underline: 2.6, // 赤の下線
  underline2: 2.2, // 近いテストの2本目
  tick: 2.6, // ちょん
  tab: 3, // タブの下線
  reached: 3.4, // 上限に達した帯の下線（緑）
  check: 2.6, // チェック（48 の大きさのとき。大きさに比例させる）
  spinner: 4, // くるくるの弧
  badge: 1, // 大きいアイコンの丸の線
} as const;

// 手で4辺を引いた枠（parts.tsx の HandBox・kids-design-round2.md 2-4 と同じ値）
export const handBox = {
  color: marker.ink,
  width: stroke.box,
  radius: 8,
  wobble: 0.6,
} as const;

// 書体の名前（アプリでは expo-font で読み込む。確認ページは Google Fonts）
//   見出し＝Yusei Magic（太字がない。fontWeight は "400" にする。太字を指定すると合成されて字がつぶれる）
//   本文・日付・ボタン・タブ＝BIZ UDPGothic（400 / 700）
//   大きな数字・Slope＝Londrina Solid（900）
export const fonts = {
  heading: "Yusei Magic",
  body: "BIZ UDPGothic",
  number: "Londrina Solid",
} as const;

// 動きの時間（ミリ秒）。確認ページ（themes/parts.tsx・ThemedHome.tsx）と指示書 3 章の値
export const timing = {
  barDelay: 280, // 使った割合の線: 開始
  barDuration: 700, // 使った割合の線: 長さ
  updateRatio: 0.66, // 取り直しで値が変わったとき（長さ × 0.66 の時間で今の位置から）
  markAt: 950, // テストの下線（カードが出始めてから）
  underline: 300,
  tickAfter: 360, // 下線のあと、ちょんまで
  tick: 80,
  tickGap: 130,
  underline2After: 520, // 近いとき: 2本目の下線
  underline2: 260,
  tick3Extra: 420, // 近いとき: 3本目のちょんはさらに後
  reachedDelay: 300, // 上限に達した帯の下線
  reached: 420,
  ring: 900, // 子02 の円（motion.duration.fill）
  spin: 1000, // くるくる1周
  checkDelay: 120, // チェック: ダイアログが出てから
  check: 320,
  field: 200, // 入力のエラー（欄の線が太くなる・文が出る）
  highlight: 200, // タブ・テーマの選択の下線
} as const;

// ホワイトボードの道具の値の組（components/ はこの形で読む。tools/marker.tsx が描き方と組にする）
export const markerTool: ToolValues = {
  name: "marker",
  colors: marker,
  stroke: { ...stroke, frame: stroke.box, frameStrong: stroke.boxFocus },
  frame: { radius: handBox.radius, wobble: handBox.wobble },
  usedBar: { insetLeft: 5, insetRight: 11, minLength: 13 }, // Figma 子01: カードの中の幅 272 のうち左 5・右 11 を空けた 256
  fonts,
  timing: { ...timing, select: timing.highlight },
};

// ── 道具に依らない値 ─────────────────────────────────────────

// QR の紙を貼るテープ（黒板・ノートの Figma 子14: 半透明の紙のテープ。テープの役目 Tape が使う）
export const paperTape = {
  chalk: "#DCD7BE", // 黒板の上で見える、少し黄みのある紙のテープ
  pencil: "#C9C8BE", // ノートの上の、灰色がかった紙のテープ
} as const;

// テーマの色見本（子06。テーマで変わらない、それぞれのモードの地の色。Figma 子06・kids-design-round2.md 3 章）
// 名前はアプリの ThemeName（light・dark）と、3つのテーマにしたときの名前の案（whiteboard・chalkboard・notebook。作り物の theme-store）の両方
export const themeSwatch: Record<string, string> = {
  light: "#EEF1F2", // 白色（ホワイトボード）
  whiteboard: "#EEF1F2",
  dark: "#172420", // 黒色（黒板）
  chalkboard: "#172420",
  note: "#ECE2CD", // ベージュ（ノート）。アプリの選択肢（theme-store.ts）にはまだない
  notebook: "#ECE2CD",
};
