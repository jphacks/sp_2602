// tmp/animations/rnweb/whiteboard/marker/HandBox.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 手で4辺を引いた枠（ホワイトボードのカード・帯・ダイアログ・入力欄・リストの行）。
// まっすぐな四角に見えないよう、4本の辺を1本ずつ黒のマーカーで引く。角で少し行き過ぎて重なり、辺はごくわずかに揺れる。
// 枠は動かさない（毎回同じ形。seed で決まる）。大きさは onLayout で測る。中身の押す操作は邪魔しない（枠は pointerEvents="none"）。
//   <HandBox seed={3} style={{ padding: 20 }}>…</HandBox>
//   width に Animated の値を渡すと、線の太さを動かせる（入力のエラーで「線を太く」するとき）
import type { ReactNode } from "react";
import { Animated, type StyleProp, View, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { handBox } from "../theme/tool";
import { handBoxPath, useSize } from "./draw";

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Props = {
  seed: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  color?: string;
  width?: number | Animated.Value | Animated.AnimatedInterpolation<number>;
  radius?: number;
  wobble?: number;
  // 押せる箱にするとき（Pressable の中で使う）などに、外側の View の代わりに測った大きさだけほしいとき
  onSize?: (w: number, h: number) => void;
} & Omit<React.ComponentProps<typeof View>, "style" | "children">;

export function HandBox({
  seed,
  children,
  style,
  color = handBox.color,
  width = handBox.width,
  radius = handBox.radius,
  wobble = handBox.wobble,
  onSize,
  ...rest
}: Props) {
  const [{ w, h }, onLayout] = useSize();
  return (
    <View
      {...rest}
      style={style}
      onLayout={(e) => {
        onLayout(e);
        onSize?.(e.nativeEvent.layout.width, e.nativeEvent.layout.height);
        rest.onLayout?.(e);
      }}
    >
      {children}
      {w > 0 && <HandFrame w={w} h={h} seed={seed} color={color} width={width} radius={radius} wobble={wobble} />}
    </View>
  );
}

// 枠の線だけ（大きさが分かっている箱の上に重ねる）
export function HandFrame({
  w,
  h,
  seed,
  color = handBox.color,
  width = handBox.width,
  radius = handBox.radius,
  wobble = handBox.wobble,
}: {
  w: number;
  h: number;
  seed: number;
  color?: string;
  width?: Props["width"];
  radius?: number;
  wobble?: number;
}) {
  const d = handBoxPath(w, h, radius, seed, wobble);
  return (
    <Svg
      pointerEvents="none"
      width={w + 12}
      height={h + 12}
      style={{ position: "absolute", left: -6, top: -6 }}
      viewBox={`-6 -6 ${w + 12} ${h + 12}`}
    >
      {typeof width === "number" ? (
        <Path d={d} stroke={color} strokeWidth={width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <AnimatedPath
          d={d}
          stroke={color}
          strokeWidth={width as never}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}
