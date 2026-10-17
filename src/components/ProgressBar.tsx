// 進捗バー（太さ 12・角丸）。percent は 0〜100（はみ出しても 0〜100 に収める。Figma 子04 のはみ出しを起こさない）。
//   <ProgressBar percent={calc.displayUsedPercent} />
//   <ProgressBar percent={view.percent} progress={value} />  … 数字の数え上げと同じ Animated.Value で動かすとき（子01）
// 塗りの幅・色は値で決まるので、ここだけ計算した style を使う（色・寸法は tokens のまま）。
// 動き（src/lib/motion.ts の決まり）: 最初に出たときは 0 から値まで伸び、そのあと値が変わったら今の位置から新しい値へ動く。
//   tone が変わったら（primary ↔ danger）色もなめらかに変える。「動きを減らす」がオンなら最後の形をすぐ出す。
//   値が分からないときはこの部品を出さない（呼ぶ側が決める。0% のバーを描かない。MVP_SPEC 5.3・AC-09）。
import { tokens } from "@contracts/tokens";
import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { motion, useReducedMotion } from "@/lib/motion";

type Props = {
  percent: number;
  // 外から動かすときの値（0〜100 の Animated.Value。useAnimatedNumber の value）。ないときはこの部品が percent まで動かす
  progress?: Animated.Value;
  tone?: "primary" | "danger";
  thin?: boolean;
  accessibilityLabel?: string;
};

export function ProgressBar({ percent, progress, tone = "primary", thin = false, accessibilityLabel }: Props) {
  const p = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0));
  const reduced = useReducedMotion();
  const own = useFillValue(progress ? null : p, reduced);
  const value = progress ?? own;
  const danger = useToneValue(tone === "danger", reduced);
  const fill = useMemo(
    () => ({
      width: value.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"], extrapolate: "clamp" }),
      backgroundColor: danger.interpolate({
        inputRange: [0, 1],
        outputRange: [tokens.color.primary, tokens.color.danger],
      }),
    }),
    [value, danger],
  );
  return (
    <View
      style={[styles.track, thin && styles.thin]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p) }}
    >
      <Animated.View style={[styles.fill, fill]} />
    </View>
  );
}

// 塗りの幅の値。motion.ts の useAnimatedNumber と同じ決まりで動かすが、画面に出す数字（display）は持たない。
// 親09 のようにバーがたくさん並ぶ画面で、1コマごとに数字のための描き直しが起きないようにするため
function useFillValue(target: number | null, reduced: boolean): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  const shown = useRef(false); // 一度でも値まで伸ばしたか（最初だけ 0 から伸ばす）
  useEffect(() => {
    if (target == null) return;
    if (reduced) {
      value.stopAnimation();
      value.setValue(target);
      shown.current = true;
      return;
    }
    const first = !shown.current;
    shown.current = true;
    const anim = Animated.timing(value, {
      toValue: target,
      duration: first ? motion.duration.fill : motion.duration.update,
      easing: motion.easing.enter,
      useNativeDriver: false, // 幅は端末側では動かせない
    });
    anim.start();
    return () => anim.stop();
  }, [target, reduced, value]);
  return value;
}

// 色の値（0 = primary・1 = danger）。最初はその色のまま出し、変わったときだけ動かす
function useToneValue(on: boolean, reduced: boolean): Animated.Value {
  const value = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      value.setValue(on ? 1 : 0);
      return;
    }
    const anim = Animated.timing(value, {
      toValue: on ? 1 : 0,
      duration: motion.duration.medium,
      easing: motion.easing.standard,
      useNativeDriver: false, // 色は幅と同じ塗りの箱に付けるので、幅と同じく JS で動かす
    });
    anim.start();
    return () => anim.stop();
  }, [on, reduced, value]);
  return value;
}

const styles = StyleSheet.create({
  track: {
    height: tokens.size.progressTrack,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.track,
    overflow: "hidden",
  },
  thin: { height: tokens.size.appBarTrack },
  fill: { height: "100%", borderRadius: tokens.radius.pill },
});
