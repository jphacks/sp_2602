// tmp/animations/rnweb/whiteboard/marker/MarkerRing.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 子02 の円（今日の使用量）。緑マーカーで円をぐるっと引く（弧の長さ＝割合）。上から時計回り。
// 下に、上限までの道筋のうすい円（3px）。端は平ら（Figma 子02 の弧は端を丸めない）。
// 100% は一周して、書き始めを少し越えて重なる（重なった所はインクが重なって少し濃い）。
// 値（割合 0〜100）は呼ぶ側が動かす（Gauge が useAnimatedNumber の value を渡す。motion.duration.fill = 900ms）。
//   <MarkerRing progress={value} size={240} />
import { useMemo } from "react";
import { Animated, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { marker, stroke } from "../theme/tool";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// 一周したあと、書き始めを越える長さ（円周に対する割合）
const OVERSHOOT = 0.035;

type Props = {
  progress: Animated.Value | Animated.AnimatedInterpolation<number>; // 0〜100
  size: number;
  width?: number;
  color?: string;
  showPath?: boolean;
};

export function MarkerRing({ progress, size, width = stroke.ring, color = marker.used, showPath = true }: Props) {
  // 線が箱からはみ出さないよう、半径は箱の半分から線の太さの分だけ内へ（Figma 子02: 240 の箱に半径 105・太さ 13）
  const r = (size - width) / 2 - 8;
  const mid = size / 2;
  const c = 2 * Math.PI * r;
  const lines = useMemo(() => {
    // 弧の長さ（px）。100% で円周＋行き過ぎ
    const arc = (progress as Animated.Value).interpolate({
      inputRange: [0, 99.5, 100],
      outputRange: [0, c * 0.995, c * (1 + OVERSHOOT)],
      extrapolate: "clamp",
    });
    const arcOffset = arc.interpolate({ inputRange: [0, c * 2], outputRange: [c * 2, 0] });
    // 行き過ぎた所（書き始めの上に重なる）だけ少し濃く
    const over = c * OVERSHOOT;
    const overOffset = arc.interpolate({ inputRange: [c, c + over], outputRange: [over, 0], extrapolate: "clamp" });
    const visible = arc.interpolate({ inputRange: [0, 0.5], outputRange: [0, 1], extrapolate: "clamp" });
    return { arcOffset, overOffset, visible, over };
  }, [progress, c]);
  const common = {
    cx: mid,
    cy: mid,
    r,
    fill: "none",
    strokeLinecap: "butt" as const,
    rotation: -90,
    origin: `${mid}, ${mid}`,
  };
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {showPath && <Circle cx={mid} cy={mid} r={r} stroke={marker.path} strokeWidth={stroke.ringPath} fill="none" />}
        <AnimatedCircle
          {...common}
          stroke={color}
          strokeWidth={width}
          strokeDasharray={`${c * 2} ${c * 2}`}
          strokeDashoffset={lines.arcOffset}
          opacity={lines.visible}
        />
        {/* 書き始めの上に重なった所。書き始めの角度から、行き過ぎた長さだけ */}
        <AnimatedCircle
          {...common}
          stroke={marker.overlap}
          strokeWidth={width - 2}
          strokeDasharray={`${lines.over} ${c * 2}`}
          strokeDashoffset={lines.overOffset}
        />
      </Svg>
    </View>
  );
}
