// tmp/animations/rnweb/whiteboard/chalk/ChalkRing.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 子02 の円（今日の使用量）。黄チョークを寝かせて太く書いた円（弧の長さ＝割合）。上から時計回り。
// 形（Figma 子02・子02-C）:
//   - 上限＝内と外の2本の点線の円（#75867A 1.2。使った割合のバーの「点線の枠」と同じ、チョークの入る場所）
//   - 黄チョークの太い弧 12（端は丸い＝棒の先）。真ん中は粉がいちばん多く白っぽく光る（芯 4）
//   - 粉のかすれ: 弧と同じ中心の円の上に、点の穴を並べた Mask（下の地がそのまま見える）
//   - 100% は一周して書き始めを少し越え、重なった所は明るい黄（粉が重なる。マーカーのように暗くならない）
// 値（割合 0〜100）は呼ぶ側が動かす（Gauge が useAnimatedNumber の value を渡す。motion.duration.fill = 900ms）。
//   <ChalkRing progress={value} size={240} />
import { useMemo } from "react";
import { Animated, View } from "react-native";
import Svg, { Circle, Defs, G, Mask, Rect } from "react-native-svg";
import { chalk, chalkStroke } from "../theme/chalk";
import type { RingProps } from "../tools";
import { holeLanes, useSvgId } from "./draw";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// 一周したあと、書き始めを越える長さ（円周に対する割合）
const OVERSHOOT = 0.035;

export function ChalkRing({ progress, size }: RingProps) {
  const id = useSvgId("chalkRing");
  const width = chalkStroke.ring;
  // Figma 子02（240 の箱）: 弧の真ん中の半径 109.5、外の点線 119、内の点線 93
  const r = size / 2 - 10.5;
  const outer = r + width / 2 + 3.5;
  const inner = r - width / 2 - 10.5;
  const mid = size / 2;
  const c = 2 * Math.PI * r;
  const lines = useMemo(() => {
    const arc = (progress as Animated.Value).interpolate({
      inputRange: [0, 99.5, 100],
      outputRange: [0, c * 0.995, c * (1 + OVERSHOOT)],
      extrapolate: "clamp",
    });
    const arcOffset = arc.interpolate({ inputRange: [0, c * 2], outputRange: [c * 2, 0] });
    const over = c * OVERSHOOT;
    const overOffset = arc.interpolate({ inputRange: [c, c + over], outputRange: [over, 0], extrapolate: "clamp" });
    const overVisible = arc.interpolate({ inputRange: [c, c + 0.5], outputRange: [0, 1], extrapolate: "clamp" });
    const visible = arc.interpolate({ inputRange: [0, 0.5], outputRange: [0, 1], extrapolate: "clamp" });
    return { arcOffset, overOffset, overVisible, visible, over };
  }, [progress, c]);
  // 粉の抜け: 弧と同じ中心の円の上に、まばらな点の穴（縁に多い。ChalkStroke と同じ作り方）
  const holes = useMemo(() => holeLanes(width, 91).map((l) => ({ ...l, r: r + l.off })), [r, width]);
  const common = {
    cx: mid,
    cy: mid,
    r,
    fill: "none",
    strokeLinecap: "round" as const,
    rotation: -90,
    origin: `${mid}, ${mid}`,
  };
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <Mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={size} height={size}>
            <Rect x={0} y={0} width={size} height={size} fill="#FFFFFF" />
            {holes.map((h, i) => (
              <Circle
                key={i}
                cx={mid}
                cy={mid}
                r={h.r}
                fill="none"
                stroke={h.tone}
                strokeWidth={h.dot}
                strokeLinecap="round"
                strokeDasharray={h.dash}
                strokeDashoffset={h.start}
              />
            ))}
          </Mask>
        </Defs>
        <Circle
          cx={mid}
          cy={mid}
          r={outer}
          stroke={chalk.limit}
          strokeWidth={chalkStroke.limit}
          strokeDasharray="4 3.2"
          fill="none"
        />
        <Circle
          cx={mid}
          cy={mid}
          r={inner}
          stroke={chalk.limit}
          strokeWidth={chalkStroke.limit}
          strokeDasharray="4 3.2"
          fill="none"
        />
        <G mask={`url(#${id})`}>
          <AnimatedCircle
            {...common}
            stroke={chalk.used}
            strokeWidth={width}
            strokeDasharray={`${c * 2} ${c * 2}`}
            strokeDashoffset={lines.arcOffset}
            opacity={lines.visible}
          />
          {/* 真ん中の光（寝かせたチョークの、粉がいちばん多い所） */}
          <AnimatedCircle
            {...common}
            stroke={chalk.usedCore}
            strokeWidth={chalkStroke.ringCore}
            strokeDasharray={`${c * 2} ${c * 2}`}
            strokeDashoffset={lines.arcOffset}
            opacity={lines.visible.interpolate({ inputRange: [0, 1], outputRange: [0, 0.95] })}
          />
          {/* 書き始めの上に重なった所（粉が重なって明るい） */}
          <AnimatedCircle
            {...common}
            stroke={chalk.usedOverlap}
            strokeWidth={width - 1}
            strokeDasharray={`${lines.over} ${c * 2}`}
            strokeDashoffset={lines.overOffset}
            opacity={lines.overVisible}
          />
        </G>
      </Svg>
    </View>
  );
}
