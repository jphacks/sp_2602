// 画面の動き（アニメーション）の共通の決まり。ゲージ・進捗バー・数字の数え上げなど、値で形が変わる動きはここを使う。
// 決まり:
//   - 値が分からない（null）ときは動かさない。取得不可を 0 から数え上げると「0%」に見えるため（MVP_SPEC 5.3・AC-09）。
//   - 最初に値が分かったときだけ 0 から伸ばす。そのあと値が変わったら（30 秒ごとの取り直しなど）、今の位置から新しい値へ動かす。
//   - 端末の「動きを減らす」（Android の「アニメーションを削除」）がオンなら、動かさずに最後の形を出す。
//   - 動いている間も画面は押せる（動きの終わりを待たせない）。
//   const { value, display } = useAnimatedNumber(percent, { duration: motion.duration.fill });
//   value は Animated.Value（幅・弧の長さに interpolate して使う）、display は画面に出す整数（null なら「--」）。
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

export const motion = {
  // ミリ秒
  duration: {
    short: 200, // 札・小さい部品が出る
    medium: 400, // カードが出る・色が変わる
    fill: 900, // ゲージ・進捗バーが値まで伸びる
    update: 600, // 取り直しで値が変わったときの移動
  },
  stagger: 60, // 棒グラフなどを順に出すときの1本ごとのずれ
  // Material 3 の動き方
  easing: {
    enter: Easing.bezier(0.2, 0, 0, 1), // emphasized decelerate（入ってきて止まる）
    standard: Easing.bezier(0.2, 0, 0, 1),
    exit: Easing.bezier(0.3, 0, 1, 1), // emphasized accelerate（出ていく）
  },
} as const;

// 端末の「動きを減らす」設定。設定が変わったらすぐに反映する
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) setReduced(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

type NumberOptions = { duration?: number; delay?: number };

// 数字を値まで動かす。null の間は動かさず display も null（「--」を出す側が決める）
export function useAnimatedNumber(
  target: number | null,
  { duration = motion.duration.fill, delay = 0 }: NumberOptions = {},
) {
  const reduced = useReducedMotion();
  const value = useRef(new Animated.Value(0)).current;
  const shown = useRef(false); // 一度でも値を出したか（最初だけ 0 から伸ばす）
  const [display, setDisplay] = useState<number | null>(null);

  useEffect(() => {
    const id = value.addListener(({ value: v }) => {
      const n = Math.round(v);
      setDisplay((prev) => (prev === n ? prev : n));
    });
    return () => value.removeListener(id);
  }, [value]);

  useEffect(() => {
    if (target == null) {
      setDisplay(null);
      return;
    }
    if (reduced) {
      value.stopAnimation();
      value.setValue(target);
      shown.current = true;
      setDisplay(Math.round(target));
      return;
    }
    const first = !shown.current;
    shown.current = true;
    const anim = Animated.timing(value, {
      toValue: target,
      duration: first ? duration : motion.duration.update,
      delay: first ? delay : 0,
      easing: motion.easing.enter,
      useNativeDriver: false, // 幅・SVG の弧に使うので JS 側で動かす
    });
    let finished = false;
    anim.start((r) => {
      finished = r.finished;
    });
    return () => {
      anim.stop();
      // 最初の伸びが終わる前に止められたら（開発中の StrictMode が effect を2回呼ぶときなど）、次も「最初」として伸ばし直す
      if (first && !finished) shown.current = false;
    };
  }, [target, reduced, value, duration, delay]);

  return { value, display, reduced };
}
