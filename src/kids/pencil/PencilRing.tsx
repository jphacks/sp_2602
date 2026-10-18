// tmp/animations/rnweb/whiteboard/pencil/PencilRing.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 子02 の円（今日の使用量）。まず鉛筆で点線の円をなぞり（使った所まで）、そのあと蛍光ペンで上から重ねる（EXPRESSION.md 1-8）。
// 形（Figma 子02・子02-B・子02-C）: 240 の箱に、半径 102 の鉛筆の点線の円（#8D8A82・1・点 3 間 3）。
//   使った所は、同じ半径に鉛筆の実線（芯・1.3）と、その下に太い蛍光ペン（#A5B37A・太さ 20・端は平ら・濃さ 0.88。罫がうっすら見える）。
//   黒鉛は蛍光ペンの下でも見えるので、鉛筆の線を上に描く。上から時計回り。
//   100% は鉛筆も蛍光ペンも書き始めを少し越え、重なった所は蛍光ペンが2回重なって濃い。
// 動き: 鉛筆の弧は呼ぶ側の値（Gauge の useAnimatedNumber・900ms）どおり。蛍光ペンは鉛筆の先を約 0.08 秒遅れで追いかける（止まれば追いつく）。
//   動きを減らすなら、追いかけずに同じ所。
//   <PencilRing progress={value} size={240} />
import { useMemo } from "react";
import { Animated, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { pencil, pencilStroke, pencilTiming } from "../theme/pencil";
import { useToolColors } from "../tools/scheme-colors";
import { useFollow } from "./draw";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const OVER_PENCIL = 0.03; // 一周したあと、鉛筆が書き始めを越える長さ（円周に対して）
const OVER_BAND = 0.04; // 蛍光ペンが越える長さ

type Prog = Animated.Value | Animated.AnimatedInterpolation<number>;

// 割合（0〜100）→ 弧の長さ。100% だけ一周＋行き過ぎ
function arcOf(p: Prog, c: number, over: number) {
  return (p as Animated.Value).interpolate({
    inputRange: [0, 99.5, 100],
    outputRange: [0, c * 0.995, c * (1 + over)],
    extrapolate: "clamp",
  });
}

function useArc(p: Prog, c: number, over: number) {
  return useMemo(() => {
    const arc = arcOf(p, c, over);
    const offset = arc.interpolate({ inputRange: [0, c * 2], outputRange: [c * 2, 0] });
    // 書き始めを越えた所（重なり）だけの弧
    const o = c * over;
    const overOffset = arc.interpolate({ inputRange: [c, c + o], outputRange: [o, 0], extrapolate: "clamp" });
    const visible = arc.interpolate({ inputRange: [0, 0.5], outputRange: [0, 1], extrapolate: "clamp" });
    return { offset, overOffset, visible, o };
  }, [p, c, over]);
}

export function PencilRing({ progress, size }: { progress: Prog; size: number }) {
  // 半径: 240 の箱で 102（Figma 子02）。大きさに比例
  const colors = useToolColors("pencil"); // 蛍光ペンの色は今の配色（緑の配色で #A5B37A）
  const r = (102 * size) / 240;
  const mid = size / 2;
  const c = 2 * Math.PI * r;
  const band = useFollow(progress, pencilTiming.ringLag);
  const lead = useArc(progress, c, OVER_PENCIL);
  const hl = useArc(band, c, OVER_BAND);
  const common = { cx: mid, cy: mid, r, fill: "none", rotation: -90, origin: `${mid}, ${mid}` };
  const bw = (pencilStroke.ringBand * size) / 240;
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* 上限までの道: 鉛筆の点線の円 */}
        <Circle
          cx={mid}
          cy={mid}
          r={r}
          stroke={pencil.limit}
          strokeWidth={pencilStroke.limit}
          strokeDasharray="3 3"
          fill="none"
        />
        {/* 蛍光ペン（平たいペン先なので端は平ら）。重なった所はもう1枚重ねて濃く */}
        <AnimatedCircle
          {...common}
          stroke={colors.highlightGreenLine}
          strokeWidth={bw}
          strokeLinecap="butt"
          opacity={Animated.multiply(hl.visible, 0.88) as never}
          strokeDasharray={`${c * 2} ${c * 2}`}
          strokeDashoffset={hl.offset}
        />
        <AnimatedCircle
          {...common}
          stroke={colors.highlightGreenLine}
          strokeWidth={bw}
          strokeLinecap="butt"
          opacity={0.5}
          strokeDasharray={`${hl.o} ${c * 2}`}
          strokeDashoffset={hl.overOffset}
        />
        {/* 鉛筆の実線（点線の上をなぞる） */}
        <AnimatedCircle
          {...common}
          stroke={pencil.lead}
          strokeWidth={pencilStroke.ringPencil}
          strokeLinecap="round"
          opacity={Animated.multiply(lead.visible, 0.9) as never}
          strokeDasharray={`${c * 2} ${c * 2}`}
          strokeDashoffset={lead.offset}
        />
        <AnimatedCircle
          {...common}
          stroke={pencil.lead}
          strokeWidth={pencilStroke.ringPencil}
          strokeLinecap="butt"
          opacity={0.5}
          strokeDasharray={`${lead.o} ${c * 2}`}
          strokeDashoffset={lead.overOffset}
        />
      </Svg>
    </View>
  );
}
