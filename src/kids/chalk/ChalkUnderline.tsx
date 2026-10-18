// tmp/animations/rnweb/whiteboard/chalk/ChalkUnderline.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 短い下線（選んでいるタブ・上限に達した帯の文の下）。黄チョークで引いた、少し波打つ1本（使った時間の色）。
// 黄チョークをさっと引くと、書き始めは濃く、終わりはかすれて抜ける。板の上を引きずるので「キュッ」とは引けない。
//   tab     … 幅 34・太さ 2.8（Figma の下のタブ）。選んだら 260ms で左から（ease.drag）。選び直したら消える
//   reached … 文の幅の 92%・太さ 2.8（Figma 子11・子01-D）。帯が出てから 300ms 待って 520ms（長い線を引きずる時間）
// 動きを減らすなら、引いた形をすぐ出す。
import { View } from "react-native";
import Svg from "react-native-svg";
import { chalk, chalkStroke, chalkTiming } from "../theme/chalk";
import type { UnderlineProps } from "../tools";
import { ChalkStroke } from "./ChalkStroke";
import { bezier } from "./draw";

export function ChalkUnderline({ width, active, kind }: UnderlineProps) {
  const reached = kind === "reached";
  const thickness = reached ? chalkStroke.reached : chalkStroke.tab;
  const h = thickness + 5;
  const pad = thickness / 2 + 0.5;
  const w = Math.max(1, width - pad * 2);
  // タブは確認ページの形（M1 3.4 C 10 1.2, 22 4.6, 33 1.8）、帯はゆるく1回だけ波打つ形（ThemedHome.tsx の ReachedBanner）
  const line = reached
    ? bezier(
        [pad, h * 0.55],
        [
          [
            [pad + w * 0.33, h * 0.3],
            [pad + w * 0.7, h * 0.78],
            [pad + w, h * 0.4],
          ],
        ],
      )
    : bezier(
        [pad, h * 0.66],
        [
          [
            [pad + w * 0.27, h * 0.24],
            [pad + w * 0.66, h * 0.86],
            [pad + w, h * 0.3],
          ],
        ],
      );
  return (
    <View pointerEvents="none" style={{ width, height: h }}>
      <Svg width={width} height={h}>
        <ChalkStroke
          d={line.d}
          length={line.len}
          color={chalk.used}
          width={thickness}
          start={active}
          delay={reached ? chalkTiming.reachedDelay : 0}
          duration={reached ? chalkTiming.reached : chalkTiming.highlight}
          seed={reached ? 23 : 29}
        />
      </Svg>
    </View>
  );
}
