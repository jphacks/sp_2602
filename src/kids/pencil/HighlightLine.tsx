// tmp/animations/rnweb/whiteboard/pencil/HighlightLine.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 蛍光ペンの短い線（Underline の役目）。
//   色は今の配色の太い線の蛍光ペン（colors.highlightGreenLine＝usedLine。緑の配色で #A5B37A）
//   tab     … 選んでいるタブの文字の下に、蛍光ペンで「行って・戻る」2本（Figma の下のタブ。EXPRESSION.md 1-14）。
//             太い線の緑 #A5B37A・太さ 3.2・濃さ 0.85、少し波打つ2本。1本目は左→右 130ms、すぐ戻りの2本目は右→左 120ms。
//             選ばれなくなったら、すぐ消す（蛍光ペンは本当は消えないので、消える途中は見せない）
//   reached … 上限に達した帯の文の下に、緑の蛍光ペンを1本（Figma 子11・子01-D。EXPRESSION.md 1-7）。
//             太さ 8・少しだけゆるく波打つ・端は丸・濃さ 0.9。出てから 300ms 待って 420ms
// 動きを減らすなら、引いた形をすぐ出す（useDraw）。
import { Animated, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { pencilStroke, pencilTiming } from "../theme/pencil";
import { useToolColors } from "../tools/scheme-colors";
import { bezier, pencilEase, useDraw } from "./draw";

const AnimatedPath = Animated.createAnimatedComponent(Path);

function Drawn({
  d,
  len,
  width,
  start,
  delay,
  duration,
  opacity,
  easing = pencilEase.sweep,
}: {
  d: string;
  len: number;
  width: number;
  start: boolean;
  delay: number;
  duration: number;
  opacity: number;
  easing?: (t: number) => number;
}) {
  const a = useDraw(len, width, start, delay, duration, easing);
  const colors = useToolColors("pencil");
  return (
    <AnimatedPath
      d={d}
      stroke={colors.highlightGreenLine}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      strokeDasharray={a.dash}
      strokeDashoffset={a.offset}
      opacity={Animated.multiply(a.opacity, opacity) as never}
    />
  );
}

export function TabHighlight({ width, active }: { width: number; active: boolean }) {
  const t = pencilStroke.tab;
  const h = 12;
  const p = t / 2 + 0.5;
  // 行き（上・左→右）と戻り（下・右→左）。戻りは少し短く、少し右下がり。文字の下端から少し離す（Figma の下のタブ）
  const go = bezier(
    [p, 4.6],
    [
      [
        [width * 0.3, 3],
        [width * 0.65, 5.6],
        [width - p, 3.8],
      ],
    ],
  );
  const back = bezier(
    [width - p - 1, 6.6],
    [
      [
        [width * 0.62, 8.4],
        [width * 0.32, 6.4],
        [p + 1.5, 8.6],
      ],
    ],
  );
  if (!active) return <View pointerEvents="none" style={{ width, height: h }} />;
  return (
    <View pointerEvents="none" style={{ width, height: h }}>
      <Svg width={width} height={h}>
        <Drawn d={go.d} len={go.len} width={t} start={active} delay={0} duration={pencilTiming.tabGo} opacity={0.85} />
        <Drawn
          d={back.d}
          len={back.len}
          width={t}
          start={active}
          delay={pencilTiming.tabGo}
          duration={pencilTiming.tabBack}
          opacity={0.85}
        />
      </Svg>
    </View>
  );
}

export function ReachedHighlight({ width, active }: { width: number; active: boolean }) {
  const t = pencilStroke.reached;
  const h = t + 4;
  const p = t / 2 + 0.5;
  const w = Math.max(1, width - p * 2);
  // 確認ページの ReachedBanner と同じ、ゆるく波打つ1本
  const line = bezier(
    [p, h * 0.55],
    [
      [
        [p + w * 0.3, h * 0.3],
        [p + w * 0.65, h * 0.75],
        [p + w, h * 0.4],
      ],
    ],
  );
  return (
    <View pointerEvents="none" style={{ width, height: h }}>
      <Svg width={width} height={h}>
        <Drawn
          d={line.d}
          len={line.len}
          width={t}
          start={active}
          delay={pencilTiming.reachedDelay}
          duration={pencilTiming.reached}
          opacity={0.9}
        />
      </Svg>
    </View>
  );
}
