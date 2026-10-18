// tmp/animations/rnweb/whiteboard/chalk/ChalkSpinner.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// くるくる（子13 QR発行中・入01 起動中・子18-B もどっています・子17 確かめています・読み込み中）。
// チョークの棒は回らない。黒板で待つ間に起きるのは「円をなぞっては、後ろから消していく」こと。だから:
//   太さ 4.5 の弧が 300°。先（今書いている所）からしばらくは濃く、後ろの 4 割が消えていく（9 段）。先には板に噛んだ少し太い点。
//   下に、消し跡のうすい円（12%）。粉のかすれ（点の抜け）。Figma 子13 の「ほぼ一周の白い弧と小さい切れ目」の形。
// 動き: 1周 1200ms・止まらない・一定の速さ（マーカーの 1000ms より少しゆっくり＝チョークで書く速さ）。回すのは native の rotate。
// 動きを減らすなら回さない（止まった弧。待っていることは文で伝わる）。
//   <ChalkSpinner />  … 大きさ 56（Figma 子13 は直径 52 の円）
import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Circle, Defs, G, Mask, Path, Rect } from "react-native-svg";
import { useReducedMotion } from "@/lib/motion";
import { chalk, chalkStroke, chalkTiming } from "../theme/chalk";
import type { SpinnerProps } from "../tools";
import { holeLanes, useSvgId } from "./draw";

const SEGMENTS = 9;
const SWEEP = 300;

export function ChalkSpinner({ size = 56, color = chalk.ink, accessibilityLabel = "読み込んでいます" }: SpinnerProps) {
  const id = useSvgId("chalkSpin");
  const reduced = useReducedMotion();
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: chalkTiming.spin, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, spin]);
  const sw = Math.max(2.2, (chalkStroke.spinner * size) / 56);
  const r = (size - sw) / 2 - 2;
  const m = size / 2;
  const at = (deg: number) =>
    [m + r * Math.sin((deg * Math.PI) / 180), m - r * Math.cos((deg * Math.PI) / 180)] as const;
  // 後ろ（消えかけ）から先（書いている所）へ。先は 12 時を越えたところ
  const parts = useMemo(() => {
    const step = SWEEP / SEGMENTS;
    return Array.from({ length: SEGMENTS }, (_, i) => {
      const [x0, y0] = at(-SWEEP + i * step);
      const [x1, y1] = at(-SWEEP + (i + 1) * step + 0.6);
      const t = (i + 1) / SEGMENTS;
      // 後ろの 4 割だけが消えていく（消しかけ）。そこから先は書いたばかりの濃い線
      return { d: `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`, opacity: 0.1 + 0.9 * Math.min(1, t / 0.45) ** 1.3 };
    });
  }, [size, r]);
  const [hx, hy] = at(0);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <View style={{ width: size, height: size }} accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={m} cy={m} r={r} stroke={color} strokeWidth={sw} opacity={0.12} fill="none" />
      </Svg>
      <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
        <Svg width={size} height={size}>
          <Defs>
            <Mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={size} height={size}>
              <Rect x={0} y={0} width={size} height={size} fill="#FFFFFF" />
              {holeLanes(sw, 61).map((l, i) => (
                <Circle
                  key={i}
                  cx={m}
                  cy={m}
                  r={r + l.off}
                  fill="none"
                  stroke={l.tone}
                  strokeWidth={l.dot}
                  strokeLinecap="round"
                  strokeDasharray={l.dash}
                  strokeDashoffset={l.start}
                />
              ))}
            </Mask>
          </Defs>
          <G mask={`url(#${id})`}>
            {parts.map((p, i) => (
              <Path
                key={i}
                d={p.d}
                stroke={color}
                strokeWidth={sw}
                strokeLinecap="butt"
                fill="none"
                opacity={p.opacity}
              />
            ))}
            <Circle cx={hx} cy={hy} r={sw * 0.62} fill={color} />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}
