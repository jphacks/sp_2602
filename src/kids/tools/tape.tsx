// tmp/animations/rnweb/whiteboard/tools/tape.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// QR の白い紙を貼ったテープ（役目 Tape。黒板・ノートの Figma 子14: 紙の角の1つに、半透明の紙のテープを1枚斜めに）。
// 道具ごとに色と角だけ変える（黒板＝右上・少し黄みのテープ / ノート＝左上・灰色がかったテープ）。ホワイトボードは使わない（マグネット類は今回なし）。
// 紙の箱の上に absolute で重ねる（押す操作は通す）。テープは紙から少しはみ出す。
import { View } from "react-native";
import { paperTape } from "../theme/tool";
import type { TapeProps } from "./index";

const LEN = 64; // テープの長さ
const THICK = 18; // 幅

function PaperTape({ w, corner, color }: TapeProps & { color: string; corner: "topLeft" | "topRight" }) {
  const left = corner === "topLeft" ? -LEN * 0.22 : w - LEN * 0.78;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: "absolute",
        left,
        top: -THICK * 0.2,
        width: LEN,
        height: THICK,
        backgroundColor: color,
        opacity: 0.88,
        borderRadius: 1,
        transform: [{ rotate: corner === "topLeft" ? "-35deg" : "35deg" }],
      }}
    />
  );
}

export const ChalkTape = ({ corner = "topRight", ...p }: TapeProps) => (
  <PaperTape {...p} corner={corner} color={paperTape.chalk} />
);
export const PencilTape = ({ corner = "topLeft", ...p }: TapeProps) => (
  <PaperTape {...p} corner={corner} color={paperTape.pencil} />
);
