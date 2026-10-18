// tmp/animations/rnweb/whiteboard/pencil/PencilButtonLine.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 線だけの丸いボタンの線（ButtonLine の役目。outline・soft・pill）。EXPRESSION.md 1-16。
// 鉛筆でカプセルを一筆で描いた形: 左上の直線から時計回りに回り、戻ってきて書き始めに 6px 重ねて終わる（重なった所が濃い）。
// 芯の色・太さ 1.5・濃さ 0.9・ごくわずかな揺れ（0.4）。押している間は 1.8・濃さ 1（ぐっと押した鉛筆）。動かさない。
// 箱の左上 (0,0) から w×h に absolute で描く（Button が見た目の箱の大きさを測って渡す）。
import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { pencil, pencilStroke } from "../theme/pencil";
import { pillPath } from "./draw";
import { Grain } from "./Grain";

export function PencilButtonLine({ w, h, pressed = false }: { w: number; h: number; pressed?: boolean }) {
  // 種はボタンの大きさから（同じ大きさのボタンは同じ形。開き直しても変わらない）
  const line = useMemo(() => pillPath(w, h, Math.round(w * 7 + h)), [w, h]);
  const stroke = {
    stroke: pencil.lead,
    strokeWidth: pressed ? pencilStroke.buttonPressed : pencilStroke.button,
    opacity: pressed ? 1 : 0.9,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: w, height: h }}>
      <Svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }}>
        <Path d={line.main} {...stroke} />
        <Path d={line.tail} {...stroke} />
      </Svg>
      <Grain radius={h / 2} opacity={0.7} />
    </View>
  );
}
