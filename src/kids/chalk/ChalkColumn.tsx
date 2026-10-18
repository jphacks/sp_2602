// tmp/animations/rnweb/whiteboard/chalk/ChalkColumn.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 週の棒（子02「今週の使用割合」）。チョークを立てる（背の高さ＝その日の割合）。下から背が伸びる。
// 形（Figma 子02・子02-B・子02-C）:
//   - 上限＝点線の枠（幅 29・角 4・#75867A 1.2。高さは上限まで）
//   - 中に立てたチョーク（幅 22・枠の内側 3.5）。上の端は使ってすり減って丸い（角 8）、下はほぼ平ら（角 2）
//   - 左から光が当たる丸い棒: 左に光の帯、右に影。中に小さなくぼみの点
//   - 今日＝黄チョーク、過去の日＝白チョーク（#D9DCD3）。マーカーのように不透明度で薄くしない（別のチョーク）
//   - 値が分からない日（記録なし・未来の日）は点線の枠だけ（0 と区別する）
// 順番と時間は BarChart が chart-motion の barDelays で決める（左から順に、今日は一拍おいて最後）。
//   <ChalkColumn area={90} length={grow} today />
import { Animated, StyleSheet, View } from "react-native";
import body from "../assets/chalk/body.png";
import { chalk, chalkStroke } from "../theme/chalk";
import type { BarColumnProps } from "../tools";
import { Speckle } from "./Speckle";

const GAP = 3.5; // 枠とチョークの間

export function ChalkColumn({ area, pathHeight = area, length, today = false }: BarColumnProps) {
  // 引く長さ（0〜area）を、枠の中に入る高さ（0〜area − 上下の間）に縮める。上限を越えた日は枠の上へ出る
  const height =
    length == null
      ? null
      : (length as Animated.Value).interpolate({
          inputRange: [0, area],
          outputRange: [0, Math.max(0, area - GAP * 2)],
        });
  return (
    <View style={[s.area, { height: area }]}>
      <View style={[s.box, { height: pathHeight }]} />
      {height && (
        <Animated.View
          style={[s.stick, { height: height as never, backgroundColor: today ? chalk.used : chalk.usedPast }]}
        >
          <View style={s.hi} />
          <View style={s.shade} />
          <Speckle src={body} width={192} height={192} />
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  area: { width: chalkStroke.columnBox + 3, justifyContent: "flex-end", alignItems: "center" },
  box: {
    position: "absolute",
    bottom: 0,
    width: chalkStroke.columnBox,
    borderWidth: chalkStroke.limit,
    borderStyle: "dashed",
    borderColor: chalk.limit,
    borderRadius: 4,
  },
  stick: {
    width: chalkStroke.column,
    marginBottom: GAP,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    overflow: "hidden",
  },
  hi: { position: "absolute", top: 0, bottom: 0, left: 3, width: 5, backgroundColor: chalk.stickHi },
  shade: { position: "absolute", top: 0, bottom: 0, right: 0, width: 6, backgroundColor: chalk.stickShade },
});
