// 「次のテスト」のカード（Figma 子01・子11 の NextTest。薄い青の地・紺の文字・左にカレンダー）。
// 「10月28日（水） 数学」「あと13日」／期間中は「テスト中」／0件は「予定なし」／取れないときは「--」。文言は child-view.ts の nextTestView。
//   <NextTestCard view={nextTestView(config, test)} emphasis={nextTestEmphasis(test)} />
// emphasis（子01 だけ。テストが近い・期間中）のときは、カードのまわりを青く2回だけゆっくり光らせ、そのあと薄い光を残す（Figma にない動き）。
//   何度もくり返さない（子どもが毎日見る画面なので、うるさくしない）。「動きを減らす」がオンなら、薄い光だけを最初から出す。
//   光はカードの後ろに置いた2枚の輪（内側が濃く外側が薄い）で、ぼかしの代わりにする（Android の影は色を選べないため）。
import { tokens } from "@contracts/tokens";
import { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Animated, Easing, StyleSheet, View } from "react-native";
import { AppText, Card, Icon, useRevealDelay } from "@/components";
import { motion, useReducedMotion } from "@/lib/motion";
import type { NextTestView } from "./child-view";

// 光り始め: 進捗バーが伸び終わったころ（目が「今日の使用量」→「次のテスト」の順に向くように）
const GLOW_LEAD = motion.duration.fill + motion.duration.short;
// 1回の「吸う・吐く」の長さ。呼吸くらいのゆっくりさにして、点滅に見えないようにする
const BREATH_IN = 1100;
const BREATH_OUT = 1300;
const SETTLE = 1500;
// 光の強さ（0〜1）。1 = 一番明るいとき、REST = 光り終わったあとに残す薄い光、LOW = 2回の間で暗くなるところ
const GLOW_REST = 0.5;
const GLOW_LOW = 0.3;
// 輪の濃さ（一番明るいとき）。内側を濃く・外側を薄くして、ふんわり見せる
const INNER_ALPHA = 0.24;
const OUTER_ALPHA = 0.12;
const breathe = Easing.inOut(Easing.sin);

type Props = { view: NextTestView; emphasis?: boolean };

export function NextTestCard({ view, emphasis = false }: Props) {
  const glow = useGlow(emphasis);
  const halo = useMemo(
    () => ({
      inner: { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, INNER_ALPHA] }) },
      outer: { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, OUTER_ALPHA] }) },
    }),
    [glow],
  );
  return (
    <View>
      <Animated.View style={[styles.haloOuter, halo.outer]} />
      <Animated.View style={[styles.haloInner, halo.inner]} />
      <Card tone="soft">
        <View style={styles.row}>
          <Icon name="event" size={tokens.size.iconLarge} color={tokens.color.onPrimarySoft} />
          <View style={styles.text}>
            <AppText variant="caption" tone="onPrimarySoft">
              次のテスト
            </AppText>
            {view.kind === "loading" ? (
              <ActivityIndicator color={tokens.color.onPrimarySoft} />
            ) : (
              <>
                <AppText variant="title" tone="onPrimarySoft">
                  {view.headline}
                </AppText>
                <AppText tone="onPrimarySoft">{view.detail}</AppText>
              </>
            )}
          </View>
        </View>
      </Card>
    </View>
  );
}

// 光の強さの値（端末側で動かす）。on の間は「2回ゆっくり光る → 薄い光を残す」、off になったら消す
function useGlow(on: boolean): Animated.Value {
  const reduced = useReducedMotion();
  const delay = useRevealDelay(on, GLOW_LEAD);
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      value.stopAnimation();
      value.setValue(on ? GLOW_REST : 0);
      return;
    }
    const step = (toValue: number, duration: number) =>
      Animated.timing(value, { toValue, duration, easing: breathe, useNativeDriver: true });
    const anim = on
      ? Animated.sequence([
          Animated.delay(delay),
          step(1, BREATH_IN),
          step(GLOW_LOW, BREATH_OUT),
          step(1, BREATH_IN),
          step(GLOW_REST, SETTLE),
        ])
      : step(0, motion.duration.medium);
    anim.start();
    return () => anim.stop();
  }, [on, reduced, delay, value]);
  return value;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space[4] },
  text: { flex: 1, gap: tokens.space[1] },
  // カードの後ろで、カードより少し大きい青い板。はみ出た縁だけが光って見える
  haloInner: {
    position: "absolute",
    top: -tokens.space[1],
    bottom: -tokens.space[1],
    left: -tokens.space[1],
    right: -tokens.space[1],
    borderRadius: tokens.radius.card + tokens.space[1],
    backgroundColor: tokens.color.primary,
    pointerEvents: "none",
  },
  haloOuter: {
    position: "absolute",
    top: -tokens.space[2],
    bottom: -tokens.space[2],
    left: -tokens.space[2],
    right: -tokens.space[2],
    borderRadius: tokens.radius.card + tokens.space[2],
    backgroundColor: tokens.color.primary,
    pointerEvents: "none",
  },
});
