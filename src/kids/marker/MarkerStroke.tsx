// tmp/animations/rnweb/whiteboard/marker/MarkerStroke.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// マーカーで1本の線を引く（SVG の中に置く部品）。書き始めが少し太く、書き終わりが少し細い（角芯のマーカーを押しつけて引く形）。
// 太さの違いは、同じ線を3本重ねて作る: 全体（太さ × 0.94）＋ 頭の 45%（× 1.06）＋ 頭の 20%（× 1.16）。
// 3本とも同じ動きで、左（書き始め）から引く。
//   const u = bezier([1, 3], [[[30, 1.2], [70, 3.6], [102, 1.4]]]);
//   <Svg …><MarkerStroke d={u.d} length={u.len} color={marker.test} width={2.6} start={open} delay={950} duration={300} /></Svg>
import { Animated } from "react-native";
import { G, Path } from "react-native-svg";
import { ease, useDraw } from "./draw";

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Props = {
  d: string;
  length: number; // 線の長さ（bezier() の len）
  color: string;
  width: number;
  start: boolean; // true になったら引き始める（false の間は見えない）
  delay?: number;
  duration: number;
  easing?: (t: number) => number;
  taper?: boolean; // 書き始めを太くするか（既定 true。細い線では false でよい）
  transform?: string;
  opacity?: number;
};

export function MarkerStroke({
  d,
  length,
  color,
  width,
  start,
  delay = 0,
  duration,
  easing = ease.draw,
  taper = true,
  transform,
  opacity = 1,
}: Props) {
  const a = useDraw(length, width, start, delay, duration, easing);
  // 頭の部分の線のずらし: ペン先が head に届くまでは、ペン先までだけ見せる
  const head = (part: number) =>
    a.offset.interpolate({
      inputRange: [a.full - length * part, a.full],
      outputRange: [0, length * part],
      extrapolate: "clamp",
    });
  const common = { d, stroke: color, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <G transform={transform} opacity={opacity}>
      <AnimatedPath
        {...common}
        strokeWidth={taper ? width * 0.94 : width}
        strokeDasharray={a.dash}
        strokeDashoffset={a.offset}
        opacity={a.opacity}
      />
      {taper && (
        <>
          <AnimatedPath
            {...common}
            strokeWidth={width * 1.06}
            strokeDasharray={`${length * 0.45} ${length * 3}`}
            strokeDashoffset={head(0.45)}
            opacity={a.opacity}
          />
          <AnimatedPath
            {...common}
            strokeWidth={width * 1.16}
            strokeDasharray={`${length * 0.2} ${length * 3}`}
            strokeDashoffset={head(0.2)}
            opacity={a.opacity}
          />
        </>
      )}
    </G>
  );
}
