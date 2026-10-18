// tmp/animations/rnweb/whiteboard/marker/MarkerHighlightLine.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 短い下線（選んでいるタブの緑の下線・上限に達した帯の文の下の緑の下線）。少しだけゆるく波打つ1本、端は丸。
// active が true になったら、左から「キュッ」と引く（タブ・テーマの選択: 200ms / 上限の帯: 300ms 待って 420ms）。
// active が false になったら消す（タブを選び直したとき）。動きを減らすなら、すぐ引いた形。
//   <MarkerHighlightLine width={34} active={focused} />                                   … タブ（濃い緑・太さ 3）
//   <MarkerHighlightLine width={w * 0.92} color={marker.used} thickness={3.4} active delay={300} duration={420} easing={ease.reached} />
import { View } from "react-native";
import Svg from "react-native-svg";
import { marker, stroke, timing } from "../theme/tool";
import { bezier, ease } from "./draw";
import { MarkerStroke } from "./MarkerStroke";

type Props = {
  width: number;
  active: boolean;
  color?: string;
  thickness?: number;
  delay?: number;
  duration?: number;
  easing?: (t: number) => number;
  wave?: number; // 波の大きさ（1 = 確認ページの形。タブは 0.3＝ほぼまっすぐ）
};

export function MarkerHighlightLine({
  width,
  active,
  color = marker.usedLine,
  thickness = stroke.tab,
  delay = 0,
  duration = timing.highlight,
  easing = ease.stroke,
  wave = 1,
}: Props) {
  const h = thickness + 5;
  const pad = thickness / 2 + 0.5;
  const w = Math.max(1, width - pad * 2);
  // 確認ページのタブの下線（M1 3.4 C 10 1.2, 22 4.6, 33 1.8）を幅に合わせて伸ばした形
  const y = (v: number) => h * (0.5 + (v - 0.5) * wave);
  const line = bezier(
    [pad, y(0.62)],
    [
      [
        [pad + w * 0.27, y(0.25)],
        [pad + w * 0.66, y(0.82)],
        [pad + w, y(0.33)],
      ],
    ],
  );
  return (
    <View pointerEvents="none" style={{ width, height: h }}>
      <Svg width={width} height={h}>
        <MarkerStroke
          d={line.d}
          length={line.len}
          color={color}
          width={thickness}
          start={active}
          delay={delay}
          duration={duration}
          easing={easing}
        />
      </Svg>
    </View>
  );
}
