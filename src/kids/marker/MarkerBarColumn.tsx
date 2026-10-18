// tmp/animations/rnweb/whiteboard/marker/MarkerBarColumn.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 週の棒（子02「今週の使用割合」）。太い緑マーカーで、下から上へ1本ずつ引く（長さ＝その日の割合）。
// 今日は濃く（used）、過去の日はインクが減ってかすれたマーカー（usedPast。配色ごとの色。Figma の配色の見本ボードで、
// 前の「used を不透明度 0.55」を色の変数 primaryMuted にした）。凡例の色見本と同じ色になる。
// 後ろに上限までの道筋のうすい縦線（3px・端は丸）。棒の角はほんの少しだけ丸い（Figma の棒はほぼ四角）。
// 値が分からない日（記録なし・未来の日）は道筋だけ（0 と区別する）。順番と時間は BarChart が chart-motion の barDelays で決める。
//   <MarkerBarColumn area={90} length={grow} today />   … length は Animated（px）。null の日は length を渡さない
import { Animated, StyleSheet, View } from "react-native";
import { stroke } from "../theme/tool";
import { useToolColors } from "../tools/scheme-colors";

type Props = {
  area: number; // 棒の場所の高さ（道筋の長さ）
  pathHeight?: number; // 道筋の高さ（上限。既定は area いっぱい）
  length?: Animated.Value | Animated.AnimatedInterpolation<number> | null; // 引いた長さ（px）
  today?: boolean;
  width?: number;
};

export function MarkerBarColumn({ area, pathHeight = area, length, today = false, width = stroke.column }: Props) {
  const colors = useToolColors("marker");
  return (
    <View style={[s.area, { height: area, width: Math.max(width, 28) }]}>
      <View style={[s.path, { height: pathHeight, backgroundColor: colors.path }]} />
      {length != null && (
        <Animated.View
          style={[s.line, { width, height: length as never, backgroundColor: today ? colors.used : colors.usedPast }]}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  area: { justifyContent: "flex-end", alignItems: "center" },
  path: { position: "absolute", bottom: 0, width: stroke.columnPath, borderRadius: stroke.columnPath / 2 },
  // 下から引く: 書き始め（下）は四角く、書き終わり（上）はほんの少し丸い
  line: { borderTopLeftRadius: 1.5, borderTopRightRadius: 1.5, borderBottomLeftRadius: 1, borderBottomRightRadius: 1 },
});
