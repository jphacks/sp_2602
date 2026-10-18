// tmp/animations/rnweb/whiteboard/chalk/ChalkStick.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 使った割合のバー（子01 系・子11・子12）。寝かせた黄チョークが左から伸びる（長さ＝使った割合）。
// 形は確認ページ（rnweb/themes/parts.tsx の ChalkBar。ユーザーが「めちゃくちゃいい感じ」と言った形）と Figma 子01 のまま:
//   上限＝点線の枠（#75867A 1.2・角 4・高さ 24）。中に黄チョーク（高さ 16）。丸い棒なので上側に光の帯、下側に影。
//   右の端（使った方）はすり減って丸い（角 9/5）。左の端は折った面で角 4。棒の中に小さなくぼみ（暗い点）。
// 置き場所: ProgressBar が左右 4 を空けて（values.usedBar）この部品を置くので、点線の枠だけ左右 4 外へ広げて、カードの中の幅いっぱいにする。
// 長さ（px）は呼ぶ側が動かす（ProgressBar・useTween）。0 なら何も見えない（チョークを置かない）。
//   <ChalkStick length={width} />
import { Animated, StyleSheet, View } from "react-native";
import body from "../assets/chalk/body.png";
import { chalk, chalkStroke, chalkTool } from "../theme/chalk";
import { useToolColors } from "../tools/scheme-colors";
import { Speckle } from "./Speckle";

type Len = Animated.Value | Animated.AnimatedInterpolation<number> | number;
type Props = { length: Len; thin?: boolean; color?: string };

export function ChalkStick({ length, thin = false, color }: Props) {
  const colors = useToolColors("chalk"); // color を渡さなければ今の配色の使った時間の色
  const h = thin ? chalkStroke.stickThin : chalkStroke.stick;
  return (
    <View style={[s.track, thin && s.trackThin]}>
      <View style={[s.limit, thin ? s.limitThin : s.limitWide]} />
      <Animated.View
        style={[
          s.stick,
          thin && s.stickThin,
          { width: length as never, height: h, backgroundColor: color ?? colors.used },
        ]}
      >
        <View style={[s.hi, thin && s.hiThin]} />
        <View style={[s.shade, thin && s.shadeThin]} />
        <Speckle src={body} width={192} height={192} />
      </Animated.View>
    </View>
  );
}

const inset = chalkTool.usedBar.insetLeft;

const s = StyleSheet.create({
  track: { height: chalkStroke.stickTrack, justifyContent: "center" },
  trackThin: { height: 12 },
  limit: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderWidth: chalkStroke.limit,
    borderStyle: "dashed",
    borderColor: chalk.limit,
    borderRadius: 4,
  },
  limitWide: { left: -inset, right: -inset },
  limitThin: { left: 0, right: 0, borderRadius: 3 },
  stick: {
    position: "absolute",
    left: 0,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 9,
    borderBottomRightRadius: 5,
    overflow: "hidden",
  },
  stickThin: {
    left: 2,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 3,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },
  hi: { position: "absolute", left: 0, right: 0, top: 2, height: 4, backgroundColor: chalk.stickHi },
  hiThin: { top: 1, height: 2 },
  shade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 5, backgroundColor: chalk.stickShade },
  shadeThin: { height: 2.5 },
});
