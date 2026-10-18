// tmp/animations/rnweb/whiteboard/components/ProgressBar.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 進捗バー（ホワイトボード・子01 系・子11 の「今日の使用量」）。props と動きはアプリの ProgressBar（src/components/ProgressBar.tsx）と同じ。
// 形: 緑マーカーで左から線を引く（長さ＝割合。marker/MarkerBar）。下に上限までの道筋のうすい線。少しでも使っていれば最低 13px（端の丸だけ）。
//   tone="danger" でも赤にしない（ホワイトボードでは赤はテストの色。使い切ったことは線が道筋の端まで届くことで伝える）。
//   thin（親09 のアプリ別の細いバー）は細いマーカー
// 動き（アプリと同じ決まり）:
//   - progress（数字の数え上げと同じ Animated.Value・0〜100）を渡されたら、それに合わせて引く（数字と線が一緒に動く）
//   - 渡されないときは、最初は 0 から 900ms で、そのあと値が変わったら今の位置から 600ms で（useAnimatedNumber と同じ決まり）
//   - 「動きを減らす」がオンなら最後の形をすぐ出す。値が分からないときはこの部品を出さない（呼ぶ側が決める）
import { useEffect, useMemo, useRef } from "react";
import { Animated, View } from "react-native";
import { motion, useReducedMotion } from "@/lib/motion";
import { useSize, useTool } from "../tools";

type Props = {
  percent: number;
  progress?: Animated.Value;
  tone?: "primary" | "danger";
  thin?: boolean;
  accessibilityLabel?: string;
};

export function ProgressBar({ percent, progress, tone: _tone, thin = false, accessibilityLabel }: Props) {
  const p = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0));
  const reduced = useReducedMotion();
  const own = useFillValue(progress ? null : p, reduced);
  const value = progress ?? own;
  const [{ w }, onLayout] = useSize();
  const { UsedBar, values } = useTool();
  // 少しでも使っていれば、道具で引いたと分かる長さ（ホワイトボードは 13px）。道筋の置き場所（左右の空き）も道具の値
  const min = thin ? 8 : values.usedBar.minLength;
  const inset = { marginLeft: values.usedBar.insetLeft, marginRight: values.usedBar.insetRight };
  // 割合 → 線の長さ（px）。最後の割合のときに「最低 13px」の長さになるよう、そこまでを比例で伸ばす
  const length = useMemo(() => {
    const full = Math.max(0, w);
    if (full === 0) return 0;
    const end = p <= 0 ? 0 : Math.max(min, (full * p) / 100);
    if (p <= 0) return value.interpolate({ inputRange: [0, 100], outputRange: [0, full], extrapolate: "clamp" });
    if (p >= 100) return value.interpolate({ inputRange: [0, 100], outputRange: [0, full], extrapolate: "clamp" });
    return value.interpolate({ inputRange: [0, p, 100], outputRange: [0, end, full], extrapolate: "clamp" });
  }, [value, w, p, min]);
  return (
    // Figma 子01: 道筋はカードの中の幅 272 のうち、左 5・右 11 を空けた 256（ProgressTrack の置き場所）
    <View
      onLayout={onLayout}
      style={thin ? null : inset}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p) }}
    >
      <UsedBar length={length} thin={thin} />
    </View>
  );
}

// 線の長さの値（useAnimatedNumber と同じ決まりで動かすが、画面に出す数字は持たない）
function useFillValue(target: number | null, reduced: boolean): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  const shown = useRef(false);
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
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [target, reduced, value]);
  return value;
}
