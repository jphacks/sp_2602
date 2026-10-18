// tmp/animations/rnweb/whiteboard/components/Gauge.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 円形ゲージ（ホワイトボード・子02 の「今日の使用量」）。props と動きはアプリの Gauge（src/components/Gauge.tsx）と同じ。
// 形（Figma 子02・子02-B・子02-C）: 緑マーカーで円を引く（太さ 13・弧の長さ＝割合・上から時計回り）。下に道筋のうすい円（3px）。
//   中央の数字は太字（Bold）の濃い緑（使った時間の色）、「％」と「使いました」は ink の本文の太さ。
//   100% は一周して書き始めと少し重なる（marker/MarkerRing）。tone="danger" でも赤にしない（赤はテストの色。到達は 100 の数字と弾みで伝える）
// 動き（src/lib/motion.ts の決まりどおり。アプリと同じ）:
//   - 値が最初に分かったとき、円が 0 から値まで伸び、中央の数字も同じ時間（900ms）で数え上がる（delay で始まりを遅らせられる）
//   - 値が変わったとき（取り直し）は、今の位置から新しい値へ
//   - null の間は円を描かず「--」のまま（0 から数えない）
//   - 100% に届いたときに一度だけ、全体が小さく弾む
//   - 「動きを減らす」がオンなら、動かさずに最後の形
import { tokens } from "@contracts/tokens";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Text } from "@/kids/lib/text";
import { motion, useAnimatedNumber } from "@/lib/motion";
import { useColors } from "@/lib/theme";
import { fonts } from "../theme/tool";
import { useTool } from "../tools";
import { AppText } from "./AppText";

const PULSE_SCALE = 1.03;
const PULSE_BACK = { stiffness: 260, damping: 12, mass: 1 } as const;

type Props = {
  percent: number | null;
  caption?: string;
  tone?: "primary" | "danger";
  valueTone?: "primary" | "danger" | "default";
  delay?: number;
};

const SIZE = tokens.size.ring;
const RING_DROP = 6;

export function Gauge({ percent, caption, tone: _tone, valueTone: _valueTone, delay = 0 }: Props) {
  const c = useColors();
  const { Ring, values } = useTool();
  const text = numberStyles;
  const p = percent == null ? null : Math.min(100, Math.max(0, percent));
  const { value, display, reduced } = useAnimatedNumber(p, { delay });
  const lastShown = useRef(0);
  if (display != null) lastShown.current = display;
  const number = (
    <Text style={[text.number, { color: p == null ? c.muted : values.colors.usedText }]}>
      {p == null ? "--" : (display ?? lastShown.current)}
    </Text>
  );
  const pulse = useReachPulse(p != null && display === 100, reduced);
  return (
    <Animated.View
      style={[styles.box, { transform: [{ scale: pulse }] }]}
      accessibilityRole="progressbar"
      // 読み上げは数え上げの途中ではなく、いつも本当の値
      accessibilityLabel={p == null ? "使用量は分かりません" : `${Math.round(p)}パーセント${caption ?? ""}`}
    >
      {/* 値が分からない間は道筋だけ（0 から数えない） */}
      {/* Figma 子02: 円は中の文字より 6 下にある（円の箱を 6 下げ、全体の高さもその分だけ足す） */}
      <View style={styles.ring}>
        <Ring progress={p != null ? value : zero} size={SIZE} />
      </View>
      <View style={styles.center}>
        <View style={styles.row}>
          {/* 数字の強調（NumberMark）はここでは使わない: 子02 は円がもう印なので、1画面に印が2つになる（印は1画面に1つまで） */}
          {number}
          <Text style={[text.unit, { color: c.text }]}>％</Text>
        </View>
        {caption && <AppText variant="body">{caption}</AppText>}
      </View>
    </Animated.View>
  );
}

const zero = new Animated.Value(0);

// 100% に届いたときに一度だけ弾む（アプリの Gauge と同じ）
function useReachPulse(reached: boolean, reduced: boolean) {
  const scale = useRef(new Animated.Value(1)).current;
  const done = useRef(false);
  useEffect(() => {
    if (!reached) {
      done.current = false;
      return;
    }
    if (done.current) return;
    if (reduced) {
      done.current = true;
      return;
    }
    const anim = Animated.sequence([
      Animated.timing(scale, {
        toValue: PULSE_SCALE,
        duration: motion.duration.short,
        easing: motion.easing.standard,
        useNativeDriver: true,
      }),
      Animated.spring(scale, { toValue: 1, ...PULSE_BACK, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => {
      if (finished) done.current = true;
    });
    return () => {
      anim.stop();
      scale.setValue(1);
    };
  }, [reached, reduced, scale]);
  return scale;
}

const styles = StyleSheet.create({
  box: { width: SIZE, height: SIZE + RING_DROP, alignSelf: "center" },
  ring: { position: "absolute", left: 0, top: RING_DROP },
  // Figma 子02: 数字は「使いました」の 12 上（行の高さ 74 のままだと 10 上に出る。数字の下を 10 詰めて、全体を 5 下げる）
  center: {
    position: "absolute",
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
  },
  row: { flexDirection: "row", alignItems: "baseline", gap: tokens.space[1], paddingLeft: 14 },
});

// 中央の数字（太字）と「％」（本文の太さ）
const numberStyles = StyleSheet.create({
  number: { ...fonts.bold, fontSize: tokens.font.ring, lineHeight: tokens.lineHeight.ring, marginBottom: -10 },
  unit: { ...fonts.body, fontSize: tokens.font.xl, lineHeight: tokens.lineHeight.xl },
});
