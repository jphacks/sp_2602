// tmp/animations/rnweb/whiteboard/marker/MarkerSpinner.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// くるくる（子13 QR発行中・入01 起動中・子18-B もどっています・子17 確かめています・読み込み中）。
// 黒マーカーの短い弧が、道筋のうすい円の上を回る（1周 1000ms・止まらない）。弧は書き始めが少し太い。
// 動きを減らすなら回さない（弧は止まったまま見える。待っていることは文で伝わる）。
//   <MarkerSpinner />  … 大きさ 56（tokens.size.spinner。Figma 子13 は直径 52 の円）
import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useReducedMotion } from "@/lib/motion";
import { marker, stroke, timing } from "../theme/tool";

type Props = { size?: number; color?: string; accessibilityLabel?: string };

export function MarkerSpinner({ size = 56, color = marker.ink, accessibilityLabel = "読み込んでいます" }: Props) {
  const reduced = useReducedMotion();
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: timing.spin, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, spin]);
  const sw = stroke.spinner;
  const r = (size - sw) / 2 - 2;
  const m = size / 2;
  // 上（12時）から時計回りに約 100° の弧。書き始め（12時）を少し太く重ねる
  const at = (deg: number, rr = r) =>
    [m + rr * Math.sin((deg * Math.PI) / 180), m - rr * Math.cos((deg * Math.PI) / 180)] as const;
  const [x0, y0] = at(0);
  const [x1, y1] = at(100);
  const [hx, hy] = at(28);
  const arc = `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
  const head = `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${hx} ${hy}`;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <View style={{ width: size, height: size }} accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={m} cy={m} r={r} stroke={marker.path} strokeWidth={stroke.ringPath} fill="none" />
      </Svg>
      <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
        <Svg width={size} height={size}>
          <Path d={arc} stroke={color} strokeWidth={sw} strokeLinecap="round" fill="none" />
          <Path d={head} stroke={color} strokeWidth={sw + 0.8} strokeLinecap="round" fill="none" />
        </Svg>
      </Animated.View>
    </View>
  );
}
