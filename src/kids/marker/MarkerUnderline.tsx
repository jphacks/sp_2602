// tmp/animations/rnweb/whiteboard/marker/MarkerUnderline.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// テストの日付の印（ホワイトボード）: 赤マーカーで日付「10月28日（水）」全体に下線を引き、書き終わりのすぐ右に「ちょん、ちょん」と短い線を2本。
// テストが近い（3日以内・期間中。child-view.ts の nextTestEmphasis）ときは twice: 下線をもう一度なぞり（2本目は 1.2 上・太さ 2.2）、ちょんを3本。
// 印は1画面に1つまで（その画面で一番大事な日付だけ）。形・値・時間は確認ページ（parts.tsx の MarkerUnderline）と kids-design-round2.md 2-2 のまま:
//   下線 2.6・少しだけ波打つ・端は丸 / ちょん 太さ 2.6・長さ 9・右に 35° / 1本目の左端 = 下線の終わり + 5、間 6 / 文字の箱の下から 8 上が上端
//   時間: 下線 delay(既定 950) から 300ms → ちょんは下線のあと +360ms から 80ms ずつ、間 130ms
//         近いとき: 2本目の下線 +520ms（260ms）、3本目のちょんはさらに +420ms
// 使い方: 測った文字の上に重ねる（Measured と一緒に）。
//   <Measured mark={(w, h) => <MarkerUnderline w={w} h={h} start={open} twice={emphasis} />}>
//     <Text style={dateStyle}>10月28日（水）</Text>
//   </Measured>
import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import Svg from "react-native-svg";
import { useReducedMotion } from "@/lib/motion";
import { stroke, timing } from "../theme/tool";
import { useToolColors } from "../tools/scheme-colors";
import { bezier, ease } from "./draw";
import { MarkerStroke } from "./MarkerStroke";

type Props = {
  w: number;
  h: number;
  start: boolean;
  twice?: boolean;
  delay?: number;
  color?: string;
  fontSize?: number;
};

export function MarkerUnderline({
  w,
  h,
  start,
  twice = false,
  delay = timing.markAt,
  color: colorProp,
  fontSize,
}: Props) {
  const colors = useToolColors("marker");
  const color = colorProp ?? colors.test; // テストの色（今の配色。使った時間と同じ色の仲間で、形＝下線とちょんで分ける）
  const reduced = useReducedMotion();
  // 字の下から下線までの空き: 日付（21 の字・行の高さ 28）は今のまま。大きな数字（ウィジェットの「13」など）は字の大きさに合わせて離す
  // （fontSize がなければ、測った高さ h から見積もる。Figma 子12 は字の下から 7 ほど空く）
  const gap = fontSize != null ? Math.max(0, (fontSize - 21) * 0.25) : Math.max(0, (h - 28) * 0.3);
  const one = bezier(
    [1, 3],
    [
      [
        [w * 0.35, 1.2],
        [w * 0.7, 3.6],
        [w + 2, 1.4],
      ],
    ],
  );
  const two = bezier(
    [4, 3.4],
    [
      [
        [w * 0.4, 2],
        [w * 0.75, 4],
        [w - 2, 2.4],
      ],
    ],
  );
  const t0 = useRef(new Animated.Value(0)).current;
  const t1 = useRef(new Animated.Value(0)).current;
  const t2 = useRef(new Animated.Value(0)).current;
  const ticks = [t0, t1, t2];
  const count = twice ? 3 : 2;
  useEffect(() => {
    if (!start || !w) {
      for (const t of ticks) t.setValue(0);
      return;
    }
    if (reduced) {
      ticks.forEach((t, i) => t.setValue(i < count ? 1 : 0));
      return;
    }
    // 下線を引き終わってから、ちょん（0.08 秒の短い線）、ちょん
    const at = delay + timing.tickAfter;
    const draw = (v: Animated.Value, d: number) =>
      Animated.timing(v, { toValue: 1, delay: d, duration: timing.tick, easing: ease.tick, useNativeDriver: false });
    const anim = Animated.parallel(
      ticks.slice(0, count).map((t, i) => draw(t, at + i * timing.tickGap + (i === 2 ? timing.tick3Extra : 0))),
    );
    anim.start();
    return () => anim.stop();
  }, [start, w, twice, reduced]);
  if (!w) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: w, height: h }}>
      <Svg width={w + 8} height={8} style={{ position: "absolute", left: -1, top: h - 1 + gap }}>
        <MarkerStroke
          d={one.d}
          length={one.len}
          color={color}
          width={stroke.underline}
          start={start}
          delay={delay}
          duration={timing.underline}
          taper={false}
        />
        {twice && (
          <MarkerStroke
            d={two.d}
            length={two.len}
            transform="translate(0 -1.2)"
            color={color}
            width={stroke.underline2}
            start={start}
            delay={delay + timing.underline2After}
            duration={timing.underline2}
            taper={false}
          />
        )}
      </Svg>
      {ticks.slice(0, count).map((v, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: w + 5 + i * 6,
            top: h - 8 + gap,
            width: stroke.tick,
            height: v.interpolate({ inputRange: [0, 1], outputRange: [0, 9] }),
            borderRadius: stroke.tick / 2,
            backgroundColor: color,
            transform: [{ rotate: "35deg" }],
          }}
        />
      ))}
    </View>
  );
}
