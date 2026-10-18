// tmp/animations/rnweb/whiteboard/pencil/Highlighter.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 蛍光ペン（ゼブラ マイルドライナー）で文字の後ろに引く帯。数字の緑（NumberMark）・テストの日付のピンク（TestMark）。
// 子どもが平たいペン先で、文字の下半分を左から右へ一息で引いた形（EXPRESSION.md 1-4・1-5）:
//   - 高さ＝文字の 0.5、文字の上から 0.45 の所から。左に 3・右に 4 はみ出す。端は平たいペン先で斜めに切れる（-8°）
//   - 書き始めと書き終わりはペン先が止まるので、端に少しだけインクがたまって濃い（幅 3 のもう少し濃い所）
//   - すける色なので、文字は前に読める（Measured が印を文字の後ろに置く）
//   - twice（テストが近い）: 少し上（0.3）を、長さ 0.85・濃さ 0.7 で、もう一度なぞる（重なった所が濃いピンク）
// 時間: 数字は数え終わってから（start）すぐ 360ms（開いたときに start を渡すなら delay 1080）。日付はカードが出てから 1170ms から 360ms、twice は +160ms 後に 300ms。
//   <Measured mark={(w, h) => <HighlightMark w={w} h={h} start={open} color={pencil.highlightPink} delay={1170} twice />}>…</Measured>
import { Animated, StyleSheet, View } from "react-native";
import { pencil, pencilTiming } from "../theme/pencil";
import { pencilEase, useStroke } from "./draw";

type Props = { w: number; h: number; start: boolean; color: string; delay: number; twice?: boolean };

function Band({
  v,
  top,
  height,
  length,
  color,
  opacity,
}: {
  v: Animated.Value;
  top: number;
  height: number;
  length: number;
  color: string;
  opacity: number;
}) {
  const width = v.interpolate({ inputRange: [0, 1], outputRange: [0, length] });
  // 書き終わりのインクだまりは、ペン先が止まってから（最後の 1 割で）出る
  const endPool = v.interpolate({ inputRange: [0, 0.9, 1], outputRange: [0, 0, 1] });
  const startPool = v.interpolate({ inputRange: [0, 0.04, 1], outputRange: [0, 1, 1] });
  return (
    <Animated.View style={[s.band, { top, height, width, opacity }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />
      <Animated.View
        style={[s.pool, s.poolStart, { backgroundColor: color, opacity: Animated.multiply(startPool, 0.35) }]}
      />
      <Animated.View
        style={[s.pool, s.poolEnd, { backgroundColor: color, opacity: Animated.multiply(endPool, 0.4) }]}
      />
    </Animated.View>
  );
}

export function HighlightMark({ w, h, start, color, delay, twice = false }: Props) {
  const one = useStroke(start, delay, pencilTiming.highlight, pencilEase.sweep, w > 0);
  const two = useStroke(
    start && twice,
    delay + pencilTiming.highlight + pencilTiming.twiceGap,
    pencilTiming.twice,
    pencilEase.sweep,
    w > 0,
  );
  if (!w) return null;
  const length = w + 7;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, s.under]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Band v={one} top={h * 0.45} height={h * 0.5} length={length} color={color} opacity={0.95} />
      {twice && <Band v={two} top={h * 0.3} height={h * 0.5} length={length * 0.85} color={color} opacity={0.7} />}
    </View>
  );
}

// 役目の部品の形（tools/pencil.tsx から使う）
export function PencilTestMark({
  w,
  h,
  start,
  twice,
  delay = pencilTiming.markAt,
}: {
  w: number;
  h: number;
  start: boolean;
  twice?: boolean;
  delay?: number;
}) {
  return <HighlightMark w={w} h={h} start={start} color={pencil.highlightPink} delay={delay} twice={twice} />;
}

// start は「数え終わったとき」（Gauge と同じ）。画面を開いたときに start を渡すなら delay={pencilTiming.numberMarkAt}（280 + 800）
export function PencilNumberMark({ w, h, start, delay = 0 }: { w: number; h: number; start: boolean; delay?: number }) {
  return <HighlightMark w={w} h={h} start={start} color={pencil.highlightGreen} delay={delay} />;
}

const s = StyleSheet.create({
  // 文字の後ろ（Measured は印を先に置くが、念のため重なり順も後ろに）
  under: { zIndex: -1 },
  band: {
    position: "absolute",
    left: -3,
    overflow: "hidden",
    // 平たいペン先: 右上と左下の角だけ少し丸く、全体を少し斜めに
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
    transform: [{ skewX: "-8deg" }],
  },
  pool: { position: "absolute", top: 0, bottom: 0, width: 3 },
  poolStart: { left: 0 },
  poolEnd: { right: 0 },
});
