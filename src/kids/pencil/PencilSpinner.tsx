// tmp/animations/rnweb/whiteboard/pencil/PencilSpinner.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// くるくる（子13 QR発行中・入01 起動中・子18-B もどっています・子17・読み込み中）。EXPRESSION.md 1-11。
// 待っている間、鉛筆で点線の円の上をくるくるなぞり続ける形: 鉛筆の先は止まらずに進み、線の長さは伸びたり縮んだりする
// （マーカーの「長さの変わらない弧が回る」とは違う）。
//   形（Figma 子13）: 点線の円（芯の色を 0.45 の濃さ・1.2・点 2.5 間 3）＋芯の色の弧（太さ 3・端は丸）
//   動き: 全体が 1 周 1200ms で回り続け、弧の長さは 70° ↔ 150° を 1600ms ずつで伸び縮み。止まらない
//   動きを減らすなら回さず、伸び縮みもしない（110° の弧が止まって見える。待っていることは文で伝わる）
//   <PencilSpinner />  … 大きさ 56（tokens.size.spinner）。color はボタンの中（主ボタンのクリームの文字の色など）
import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useReducedMotion } from "@/lib/motion";
import { pencil, pencilStroke, pencilTiming } from "../theme/pencil";
import { pencilEase } from "./draw";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const MIN_DEG = 70;
const MAX_DEG = 150;
const REST_DEG = 110;

type Props = { size?: number; color?: string; accessibilityLabel?: string };

export function PencilSpinner({ size = 56, color = pencil.lead, accessibilityLabel = "読み込んでいます" }: Props) {
  const reduced = useReducedMotion();
  const spin = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (reduced) {
      spin.stopAnimation();
      breathe.stopAnimation();
      spin.setValue(0);
      breathe.setValue(0.5);
      return;
    }
    const turn = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: pencilTiming.spin, easing: Easing.linear, useNativeDriver: true }),
    );
    breathe.setValue(0);
    const grow = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: pencilTiming.breathe,
          easing: pencilEase.breathe,
          useNativeDriver: false,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: pencilTiming.breathe,
          easing: pencilEase.breathe,
          useNativeDriver: false,
        }),
      ]),
    );
    turn.start();
    grow.start();
    return () => {
      turn.stop();
      grow.stop();
    };
  }, [reduced, spin, breathe]);
  // 小さいとき（ボタンの中の 22）は線を細く
  const sw = size < 40 ? 2.2 : pencilStroke.spinner;
  const r = (size - sw) / 2 - 2;
  const m = size / 2;
  const c = 2 * Math.PI * r;
  const deg = (d: number) => (c * d) / 360;
  // 弧の長さ（px）→ 線のずらし
  const offset = reduced
    ? c - deg(REST_DEG)
    : breathe.interpolate({ inputRange: [0, 1], outputRange: [c - deg(MIN_DEG), c - deg(MAX_DEG)] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <View style={{ width: size, height: size }} accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={m}
          cy={m}
          r={r}
          stroke={color}
          strokeOpacity={0.45}
          strokeWidth={size < 40 ? 1 : 1.2}
          strokeDasharray="2.5 3"
          fill="none"
        />
      </Svg>
      <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
        <Svg width={size} height={size}>
          <AnimatedCircle
            cx={m}
            cy={m}
            r={r}
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            fill="none"
            rotation={-90}
            origin={`${m}, ${m}`}
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={offset as never}
            opacity={0.92}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
