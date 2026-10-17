// 円形ゲージ（子02 の「今日の使用量」。240×240・中央に数字）。percent は 0〜100 の使用済みの割合（C3 の displayUsedPercent）。
// 値が分からないとき（取得不可）は percent に null を渡すと「--」を出す（0% と表示しない）。
//   <Gauge percent={calc.state === "ok" ? calc.displayUsedPercent : null} caption="使いました" />
// 中央の数字の色は valueTone で選べる（既定は弧と同じ色。Figma 子02 は黒 = "default"）
// 動き（src/lib/motion.ts の決まりどおり）:
//   - 値が最初に分かったとき、弧が 0 から値まで伸び、中央の数字も同じ時間で数え上がる（delay で始まりを遅らせられる）
//   - 値が変わったとき（取り直し）は、今の位置から新しい値へ動く（0 からやり直さない）
//   - null の間は弧を描かず「--」のまま（0 から数えない。MVP_SPEC 5.3・AC-09）
//   - tone（弧の色）が変わったときは、2本の弧の透明度を入れ替えて色をなめらかに変える
//     （SVG の stroke の色を動かすと、端末によって効かないことがあるため。透明度なら確実に動く）
//   - 100% に届いたときに一度だけ、ゲージ全体が小さく弾む（責めない控えめな合図。下がったらまた弾めるようにする）
//   - 「動きを減らす」がオンなら、動かさずに最後の形を出す
import { tokens } from "@contracts/tokens";
import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { motion, useAnimatedNumber } from "@/lib/motion";
import { AppText } from "./AppText";

// 弧（SVG の円）の線の位置を、JS 側で毎コマ動かす（SVG の属性は端末側で動かせないため）
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// 100% に届いたときの弾み。3% だけ大きくなって、ばねで戻る（少しだけ行き過ぎて止まる）
const PULSE_SCALE = 1.03;
const PULSE_BACK = { stiffness: 260, damping: 12, mass: 1 } as const;

type Props = {
  percent: number | null;
  caption?: string;
  tone?: "primary" | "danger"; // 弧の色
  valueTone?: "primary" | "danger" | "default"; // 中央の数字と「％」の色（省くと弧と同じ色）
  delay?: number; // 値が最初に分かってから、伸び始めるまでの待ち（ミリ秒）。画面の出る順番に合わせる
};

const SIZE = tokens.size.ring;
const STROKE = tokens.size.ringStroke;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R; // 円周（弧の長さ = 円周 × 割合）
const MID = SIZE / 2;

export function Gauge({ percent, caption, tone = "primary", valueTone, delay = 0 }: Props) {
  const p = percent == null ? null : Math.min(100, Math.max(0, percent));
  const { value, display, reduced } = useAnimatedNumber(p, { delay });
  // 数え上げの途中の数字。値が一度消えて（null）戻ったときは、前の数字から動かす（一瞬 0 を出さない）
  const lastShown = useRef(0);
  if (display != null) lastShown.current = display;

  // 割合 0〜100 → 線のずらし幅（円周〜0）。ずらすほど弧が短くなる
  const offset = useMemo(
    () => value.interpolate({ inputRange: [0, 100], outputRange: [C, 0], extrapolate: "clamp" }),
    [value],
  );
  const danger = useToneFade(tone === "danger", reduced);
  const layers = useMemo(
    () => ({
      primary: { opacity: danger.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
      danger: { opacity: danger },
    }),
    [danger],
  );
  const pulse = useReachPulse(p != null && display === 100, reduced);
  const pulseStyle = useMemo(() => ({ transform: [{ scale: pulse }] }), [pulse]);

  const numberTone = valueTone ?? tone;
  return (
    <Animated.View
      style={[styles.box, pulseStyle]}
      accessibilityRole="progressbar"
      // 読み上げは数え上げの途中ではなく、いつも本当の値（動きを待たせない）
      accessibilityLabel={p == null ? "使用量は分かりません" : `${Math.round(p)}パーセント${caption ?? ""}`}
    >
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={MID} cy={MID} r={R} stroke={tokens.color.track} strokeWidth={STROKE} fill="none" />
      </Svg>
      {p != null && (
        <>
          <Animated.View style={[styles.layer, layers.primary]} pointerEvents="none">
            <Arc color={tokens.color.primary} offset={offset} />
          </Animated.View>
          <Animated.View style={[styles.layer, layers.danger]} pointerEvents="none">
            <Arc color={tokens.color.danger} offset={offset} />
          </Animated.View>
        </>
      )}
      <View style={styles.center}>
        <View style={styles.row}>
          <AppText variant="ring" tone={numberTone}>
            {p == null ? "--" : (display ?? lastShown.current)}
          </AppText>
          <AppText variant="title" tone={numberTone}>
            ％
          </AppText>
        </View>
        {caption && <AppText variant="body">{caption}</AppText>}
      </View>
    </Animated.View>
  );
}

// 値の分かっている弧（上から時計回り。線の端は丸い）
function Arc({ color, offset }: { color: string; offset: Animated.AnimatedInterpolation<number> }) {
  return (
    <Svg width={SIZE} height={SIZE}>
      <AnimatedCircle
        cx={MID}
        cy={MID}
        r={R}
        stroke={color}
        strokeWidth={STROKE}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${C} ${C}`}
        strokeDashoffset={offset}
        rotation={-90}
        origin={`${MID}, ${MID}`}
      />
    </Svg>
  );
}

// 弧の色の入れ替え（0 = primary・1 = danger）。透明度だけなので端末側で動かす
function useToneFade(on: boolean, reduced: boolean) {
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      v.stopAnimation();
      v.setValue(on ? 1 : 0);
      return;
    }
    const anim = Animated.timing(v, {
      toValue: on ? 1 : 0,
      duration: motion.duration.medium,
      easing: motion.easing.standard,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [on, reduced, v]);
  return v;
}

// 100% に届いたときに一度だけ弾む。100 未満に下がったら（次の日・上限が増えた）、また弾めるように戻す
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
      done.current = true; // 動きを減らす: 弾まない（形はそのまま）
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
    // 弾み終えたときに「済み」にする（途中で止められたら、次にもう一度弾む）
    anim.start(({ finished }) => {
      if (finished) done.current = true;
    });
    return () => {
      anim.stop();
      scale.setValue(1); // 途中で止めたときに大きいまま残さない
    };
  }, [reached, reduced, scale]);
  return scale;
}

const styles = StyleSheet.create({
  box: { width: SIZE, height: SIZE, alignSelf: "center" },
  layer: { ...StyleSheet.absoluteFill },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "baseline", gap: tokens.space[1] },
});
