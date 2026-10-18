// 札などを「ぽん」と出す入れ物（小さく拡大しながらフェードで出る）。中身の見た目は変えない。
//   <PopIn delay={640} replayKey={pace.label}><Chip label={pace.label} /></PopIn>
// - delay: 最初に出るまでの待ち（ミリ秒）。子02 はゲージが伸び終わるころに出す（src/components/child/usage-timeline.ts）
// - replayKey: 中身が変わったとき（「ちょうどいいペース！」→「ゆっくり使おう」）に、待たずに小さくもう一度弾ませる
// 決まり（src/lib/motion.ts と同じ）: 「動きを減らす」がオンなら動かさずに最後の形を出す。
// 出る前も場所は取っておく（透明なだけ）ので、出たときに下のグラフやボタンの位置がずれない。押せる部品の邪魔もしない。
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import { motion, useReducedMotion } from "@/lib/motion";

// 最初は少し小さい所から（0 からだと「飛び出す」感じが強すぎる）
const FROM_SCALE = 0.85;
// 中身が変わったときは、さらに控えめに
const AGAIN_SCALE = 0.92;
// 「ぽん」のばね。少しだけ行き過ぎて戻る（行き過ぎは 2% ほど。0.45 秒ほどで止まる）
const POP_SPRING = { stiffness: 300, damping: 18, mass: 1 } as const;

// style: 入れ物の置き場所（左に寄せた札を、その場で弾ませるときの alignSelf など）。なければ今までどおり
type Props = { delay?: number; replayKey?: string; style?: StyleProp<ViewStyle>; children: ReactNode };

export function PopIn({ delay = 0, replayKey, style: place, children }: Props) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(FROM_SCALE)).current;
  // 出し終えた中身の replayKey（null = まだ出し終えていない）。出し終えたときに書く
  // （途中で止められたときは、次にもう一度「最初の出方」でやり直して、透明のまま残らないようにする）
  const shownKey = useRef<string | undefined | null>(null);

  useEffect(() => {
    if (reduced) {
      opacity.stopAnimation();
      scale.stopAnimation();
      opacity.setValue(1);
      scale.setValue(1);
      shownKey.current = replayKey;
      return;
    }
    const first = shownKey.current === null;
    // 「動きを減らす」が切り替わっただけ（中身は同じ）なら出し直さない
    if (!first && shownKey.current === replayKey) return;
    if (!first) scale.setValue(AGAIN_SCALE);
    const anim = Animated.sequence([
      Animated.delay(first ? delay : 0),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: motion.duration.short,
          easing: motion.easing.enter,
          useNativeDriver: true, // 透明度と大きさだけなので端末側で動かす（JS が忙しくてもなめらか）
        }),
        Animated.spring(scale, { toValue: 1, ...POP_SPRING, useNativeDriver: true }),
      ]),
    ]);
    anim.start(({ finished }) => {
      if (finished) shownKey.current = replayKey;
    });
    return () => anim.stop();
  }, [replayKey, reduced, delay, opacity, scale]);

  const style = useMemo(() => ({ opacity, transform: [{ scale }] }), [opacity, scale]);
  return <Animated.View style={[place, style]}>{children}</Animated.View>;
}
