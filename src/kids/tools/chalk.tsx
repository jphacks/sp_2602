// tmp/animations/rnweb/whiteboard/tools/chalk.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 黒板の道具（ダストレスチョーク）。役目（tools/index.tsx の Tool）を、chalk/ の描き方につなぐ。値は theme/chalk.ts の chalkTool。
// 役目ごとの表現（マーカーと違うところ・時間・動きを減らすとき）は chalk/EXPRESSION.md。
//   Frame        … 一段明るい黒板＋定規で引いたまっすぐな線＋粒（帯は線なし・札は丸い・入力欄は白い線）
//   FrameLine    … かすれた線。emphasis で「強くもう一度なぞった」抜けのない線が重なる
//   UsedBar      … 寝かせた黄チョークが伸びる（点線の枠の中）
//   TestMark     … ピンクのチョークで日付を丸く囲む（twice で2周）
//   Ring         … 寝かせた黄チョークの太い円（芯の光・重なりは明るく・内外の点線）
//   BarColumn    … 立てたチョーク（今日＝黄・過去＝白）
//   Check        … 2画のチェック（カッ、カッ）
//   Spinner      … 書いては後ろから消える弧
//   Underline    … 黄チョークの下線（引きずる速さ）
//   TabBackground… 粉受け
//   Backdrop     … 消し跡
//   ButtonLine   … 粉のかすれのある丸い線
//   NumberMark   … なし（黒板に蛍光ペンはない）
// 注意: tools/index.tsx がこのファイルを読むので、ここからは index.tsx を型としてだけ読む（import type）。
import { ChalkCheck } from "../chalk/ChalkCheck";
import { ChalkCircle } from "../chalk/ChalkCircle";
import { ChalkColumn } from "../chalk/ChalkColumn";
import { ChalkBadgeFill, ChalkTitleGrain, ChalkWidgetFrame } from "../chalk/ChalkExtras";
import { ChalkFrame, ChalkFrameLine } from "../chalk/ChalkFrame";
import { ChalkPillLine } from "../chalk/ChalkPillLine";
import { ChalkRing } from "../chalk/ChalkRing";
import { ChalkSpinner } from "../chalk/ChalkSpinner";
import { ChalkStick } from "../chalk/ChalkStick";
import { ChalkTray } from "../chalk/ChalkTray";
import { ChalkUnderline } from "../chalk/ChalkUnderline";
import { EraserHaze } from "../chalk/EraserHaze";
import { chalkTool } from "../theme/chalk";
import type { Tool } from "./index";
import { ChalkTape } from "./tape";

export const chalkKit: Tool | null = {
  values: chalkTool,
  Frame: ChalkFrame,
  FrameLine: ChalkFrameLine,
  UsedBar: ({ length, thin }) => <ChalkStick length={length} thin={thin} />,
  TestMark: ChalkCircle,
  Ring: ChalkRing,
  BarColumn: ChalkColumn,
  Check: ChalkCheck,
  Spinner: ChalkSpinner,
  Underline: ChalkUnderline,
  TabBackground: ChalkTray,
  Backdrop: EraserHaze,
  ButtonLine: ChalkPillLine,
  // 土台の担当が足した役目（黒板の担当の了承済み）
  Tape: ChalkTape, // QR の紙を右上のテープ1枚で貼る
  BadgeFill: ChalkBadgeFill, // 大きいアイコンの丸の地＝一段明るい黒板＋粒
  TitleGrain: ChalkTitleGrain, // 上のバーの字のかすれ
  WidgetFrame: ChalkWidgetFrame, // ウィジェット＝木の枠の小さい黒板
};
