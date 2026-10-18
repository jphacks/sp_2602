// tmp/animations/rnweb/whiteboard/pencil/PencilColumn.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 週の棒（子02「今週の使用割合」）。1日ごとに鉛筆を1本ずつ立てる（EXPRESSION.md 1-9。Figma 子02・子02-B・子02-C）:
//   - 点線の箱（幅 28・#8D8A82・角 4・高さ＝上限）が鉛筆立て。値が分からない日（記録なし・未来の日）は箱だけ（0 と区別する）
//   - 中に幅 20 の縦の鉛筆。下から 消しゴム＋金具 14・軸・削った先 20。高さ＝その日の割合（軸だけ伸びる）
//   - 今日は濃い軸（axis）、過去の日は色のうすい軸（axisPast。日に焼けた古い鉛筆）。どちらも今の配色の色（緑の配色で #525735・#A9AC8C）
//   - 短いうちは、箱の下から押し上がって出てくる（削った先から見えてくる）
// 長さ（px）と順番・時間は BarChart が決める（chart-motion の barDelays。今日は一拍おいて最後）。
//   <PencilColumn area={90} length={grow} today />
import { useMemo } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { pencil, pencilStroke } from "../theme/pencil";
import { useToolColors } from "../tools/scheme-colors";
import { Grain } from "./Grain";
import { Facets, PencilEndUp, PencilTipUp } from "./PencilShapes";

const BOX_W = 28;
const PENCIL_W = 20;
const END = 14; // 消しゴム＋金具（縦）
const TIP = 20; // 削った先（縦）
const FIXED = END + TIP;
const BOTTOM = 3; // 箱の下の内側の空き

type Props = {
  area: number;
  pathHeight?: number;
  length?: Animated.Value | Animated.AnimatedInterpolation<number> | null;
  today?: boolean;
};

export function PencilColumn({ area, pathHeight = area, length, today = false }: Props) {
  const colors = useToolColors("pencil");
  const lines = useMemo(() => {
    if (length == null) return null;
    // 鉛筆が描ける高さ（場所の高さ − 下の空き）に縮める
    const total = Animated.multiply(length, Math.max(0, area - BOTTOM) / Math.max(1, area));
    const body = total.interpolate({
      inputRange: [0, FIXED, 4000],
      outputRange: [0, 0, 4000 - FIXED],
      extrapolate: "clamp",
    });
    const shift = total.interpolate({ inputRange: [0, FIXED, 4000], outputRange: [FIXED, 0, 0], extrapolate: "clamp" });
    return { body, shift };
  }, [length, area]);
  return (
    <View style={[s.area, { height: area }]}>
      <View style={[s.box, { height: pathHeight }]} />
      {lines && (
        <View style={[s.clip, { height: area - BOTTOM }]}>
          <Animated.View style={[s.pencil, { transform: [{ translateY: lines.shift }] }]}>
            <PencilTipUp width={PENCIL_W} length={TIP} />
            <Animated.View
              style={[s.body, { height: lines.body, backgroundColor: today ? colors.axis : colors.axisPast }]}
            >
              <Facets vertical scale={PENCIL_W / 18} />
              <Grain />
            </Animated.View>
            <PencilEndUp width={PENCIL_W} length={END} />
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  area: { width: BOX_W, justifyContent: "flex-end", alignItems: "center" },
  box: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderWidth: pencilStroke.limit,
    borderStyle: "dashed",
    borderColor: pencil.limit,
    borderRadius: 4,
  },
  clip: { position: "absolute", bottom: BOTTOM, left: (BOX_W - PENCIL_W) / 2, width: PENCIL_W, overflow: "hidden" },
  pencil: { position: "absolute", left: 0, bottom: 0, width: PENCIL_W },
  body: {
    width: PENCIL_W,
    borderLeftWidth: 1.15,
    borderRightWidth: 1.15,
    borderColor: pencil.lead,
    overflow: "hidden",
  },
});
