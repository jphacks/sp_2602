// tmp/animations/rnweb/whiteboard/pencil/PencilStroke.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 鉛筆で1本の線を書く（SVG の中に置く部品）。鉛筆は太さがほとんど変わらず、書き終わりで鉛筆を上げるので「細く・うすく抜ける」。
// （マーカーの MarkerStroke は書き始めが太い。鉛筆は逆に、終わりが細い）
// 抜けは、同じ線を2本重ねて作る: 全体（太さ × 0.7・うすめ）＋ 頭から (1 − lift) まで（太さ × 1）。
// 2本とも同じ動きで、書き始めから書く。描き始めるまでは見えない（丸い端の点も出さない）。動きを減らすなら書き終わった形。
//   const c = bezier([4.2, 12.9], [...]);
//   <Svg …><PencilStroke d={c.d} length={c.len} color={pencil.lead} width={1.4} start={open} delay={120} duration={300} /></Svg>
import { Animated } from "react-native";
import { G, Path } from "react-native-svg";
import { pencilEase, useDraw } from "./draw";

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Props = {
  d: string;
  length: number;
  color: string;
  width: number;
  start: boolean;
  delay?: number;
  duration: number;
  easing?: (t: number) => number;
  lift?: number; // 書き終わりの抜けの長さ（線の長さに対して。0 で抜けなし）
  opacity?: number;
};

export function PencilStroke({
  d,
  length,
  color,
  width,
  start,
  delay = 0,
  duration,
  easing = pencilEase.write,
  lift = 0.3,
  opacity = 0.92,
}: Props) {
  const a = useDraw(length, width, start, delay, duration, easing);
  const common = { d, stroke: color, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  // 頭の部分（抜けより前）: ペン先がそこに届くまでは、ペン先までだけ見せる
  const headLen = length * (1 - lift);
  const head = a.offset.interpolate({
    inputRange: [a.full - headLen, a.full],
    outputRange: [0, headLen],
    extrapolate: "clamp",
  });
  return (
    <G opacity={opacity}>
      <AnimatedPath
        {...common}
        strokeWidth={lift > 0 ? width * 0.7 : width}
        strokeDasharray={a.dash}
        strokeDashoffset={a.offset}
        opacity={a.opacity}
      />
      {lift > 0 && (
        <AnimatedPath
          {...common}
          strokeWidth={width}
          strokeDasharray={`${headLen} ${length * 3}`}
          strokeDashoffset={head}
          opacity={a.opacity}
        />
      )}
    </G>
  );
}
