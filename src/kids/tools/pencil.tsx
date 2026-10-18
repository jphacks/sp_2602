// tmp/animations/rnweb/whiteboard/tools/pencil.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// ノートの道具（鉛筆・蛍光ペン・赤ペンと MD ノート）。役目の部品（tools/index.tsx の Tool）を、pencil/ の描き方につなぐ。
// 値は theme/pencil.ts の pencilTool。なぜその形・その動きかは pencil/EXPRESSION.md（マーカーの色を替えた使い回しにしない）。

import { PencilNumberMark, PencilTestMark } from "../pencil/Highlighter";
import { ReachedHighlight, TabHighlight } from "../pencil/HighlightLine";
import { NoteBackdrop } from "../pencil/NoteRules";
import { NoteTabBackground } from "../pencil/NoteTabBackground";
import { PencilBar } from "../pencil/PencilBar";
import { PencilButtonFill } from "../pencil/PencilButtonFill";
import { PencilButtonLine } from "../pencil/PencilButtonLine";
import { PencilCheck } from "../pencil/PencilCheck";
import { PencilColumn } from "../pencil/PencilColumn";
import { PencilFrame, PencilFrameLine } from "../pencil/PencilFrame";
import { PencilRing } from "../pencil/PencilRing";
import { PencilSpinner } from "../pencil/PencilSpinner";
import { pencilTool } from "../theme/pencil";
import type { FrameProps, Tool, UnderlineProps } from "./index";
import { PencilTape } from "./tape";

// 短い線: タブ＝緑の蛍光ペンで往復2本 / 上限の帯＝太い緑の蛍光ペン1本
function Underline({ width, active, kind }: UnderlineProps) {
  return kind === "reached" ? (
    <ReachedHighlight width={width} active={active} />
  ) : (
    <TabHighlight width={width} active={active} />
  );
}

export const pencilKit: Tool | null = {
  values: pencilTool,
  // 鉛筆の4辺の枠＋紙の粒（カードは半透明の紙、ダイアログは罫のある紙）。テストの枠（tone）もノートは同じ形
  Frame: ({ tone: _tone, ...p }: FrameProps) => <PencilFrame {...p} />,
  FrameLine: PencilFrameLine, // 入力欄・選択肢の枠。emphasis で「もう一度なぞる」
  UsedBar: ({ length, thin }) => <PencilBar length={length} thin={thin} />, // 伸びる鉛筆（芯の先＝使った割合）
  TestMark: (p) => <PencilTestMark {...p} />, // ピンクの蛍光ペン（twice で、もう一度なぞる）
  Ring: ({ progress, size }) => <PencilRing progress={progress} size={size} />, // 鉛筆でなぞる → 蛍光ペンが追いかける
  BarColumn: (p) => <PencilColumn {...p} />, // 立てた鉛筆（今日は濃い緑の軸）
  Check: (p) => <PencilCheck {...p} />, // 鉛筆のチェック（終わりが細く抜ける。丸もその場で書く）
  Spinner: (p) => <PencilSpinner {...p} />, // 点線の円の上を、伸び縮みしながらなぞる
  Underline,
  TabBackground: NoteTabBackground, // 紙のまま、上に定規で引いた線
  Backdrop: NoteBackdrop, // MD ノートの横罫
  NumberMark: (p) => <PencilNumberMark {...p} />, // 数字の後ろの緑の蛍光ペン（数え上げのあと）
  ButtonLine: PencilButtonLine, // 一筆で描いたカプセルの鉛筆の線
  ButtonFill: PencilButtonFill, // 主ボタンの地に紙の粒（土台の担当が足した）
  Tape: PencilTape, // QR の紙を左上のテープ1枚で貼る（土台の担当が足した）
};
