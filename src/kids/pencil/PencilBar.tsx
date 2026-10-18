// tmp/animations/rnweb/whiteboard/pencil/PencilBar.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 使った割合のバー（ノート・子01 系・子11・子12）。鉛筆が伸びる: 芯の先までの長さ＝使った割合（EXPRESSION.md 1-3）。
// 確認ページの NotePencilBar（rnweb/themes/parts.tsx）をそのまま引き継ぐ:
//   - 上限は、鉛筆で引いた点線の箱（#8D8A82・1.2・角 4）。鉛筆は箱の中に、左右 3 空けて置く
//   - 消しゴム・金具・削った先は同じ大きさのまま、軸だけが伸びる
//   - 割合が小さいうちは、鉛筆が左の箱の外から出てくる（消しゴムの側から見えてくる）。0% は何も見えない
//   - thin（親の細いバー）は同じ形を 0.6 倍の太さで
// 長さ（px。0〜バーの幅）は呼ぶ側が動かす（ProgressBar・useTween）。ここでは「芯の先が箱の右の内側（幅 − 6）に届く」ように縮めて描く。
//   <PencilBar length={width} />
import { useMemo } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { pencil, pencilStroke } from "../theme/pencil";
import { useToolColors } from "../tools/scheme-colors";
import { useSize } from "./draw";
import { Grain } from "./Grain";
import { Facets, PENCIL_FIXED, PENCIL_H, PencilEnd, PencilTip } from "./PencilShapes";

type Len = Animated.Value | Animated.AnimatedInterpolation<number> | number;

const PAD = 3; // 箱の内側の空き

export function PencilBar({ length, thin = false }: { length: Len; thin?: boolean }) {
  const k = thin ? 0.6 : 1;
  const colors = useToolColors("pencil"); // 軸の色は今の配色（色鉛筆の軸 primaryFill）
  const [{ w }, onLayout] = useSize();
  const fixed = PENCIL_FIXED * k;
  const lines = useMemo(() => {
    const src = typeof length === "number" ? new Animated.Value(length) : length;
    // 呼ぶ側の長さはバーの幅いっぱいまで。鉛筆が描ける長さ（幅 − 左右の空き）に縮める
    const scale = w > 0 ? Math.max(0, w - PAD * 2) / w : 1;
    const tip = Animated.multiply(src, scale);
    const body = tip.interpolate({
      inputRange: [0, fixed, 4000],
      outputRange: [0, 0, 4000 - fixed],
      extrapolate: "clamp",
    });
    const shift = tip.interpolate({ inputRange: [0, fixed, 4000], outputRange: [-fixed, 0, 0], extrapolate: "clamp" });
    return { body, shift };
  }, [length, w, fixed]);
  const h = PENCIL_H * k;
  return (
    <View style={[s.track, thin && s.trackThin]} onLayout={onLayout}>
      <View style={[s.limit, thin && s.limitThin]} />
      <View style={[s.clip, { top: PAD, height: h }, thin && s.clipThin]}>
        <Animated.View style={[s.row, { height: h, transform: [{ translateX: lines.shift }] }]}>
          <PencilEnd scale={k} />
          <Animated.View style={[s.body, { width: lines.body, height: h, backgroundColor: colors.axis }]}>
            <Facets scale={k} />
            <Grain heavy={false} />
          </Animated.View>
          <PencilTip scale={k} />
        </Animated.View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  track: { height: PENCIL_H + PAD * 2, justifyContent: "center" },
  trackThin: { height: PENCIL_H * 0.6 + PAD * 2 },
  limit: {
    ...StyleSheet.absoluteFill,
    borderWidth: pencilStroke.limit * 1.2,
    borderStyle: "dashed",
    borderColor: pencil.limit,
    borderRadius: 4,
  },
  limitThin: { borderRadius: 3 },
  clip: { position: "absolute", left: PAD, right: PAD, overflow: "hidden" },
  clipThin: {},
  row: { position: "absolute", left: 0, top: 0, flexDirection: "row" },
  body: { borderTopWidth: 1.15, borderBottomWidth: 1.15, borderColor: pencil.lead, overflow: "hidden" },
});
