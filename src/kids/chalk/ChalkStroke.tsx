// tmp/animations/rnweb/whiteboard/chalk/ChalkStroke.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// チョークで1本の線を引く（SVG の中に置く部品）。マーカーの MarkerStroke（頭が太い）とは違い、チョークは先がつぶれないので
// 押す強さで変わるのは「濃さ」（粉の量）。だから太さは変えず、濃さを4段で少しずつ下げる:
//   はじめの 6.5 割＝濃い（1）→ 0.93 → 0.85 → 終わりの 1 割弱＝0.72（手を浮かせて、かすれて抜ける）
//   段の境目は平らな端にして目立たせない（丸い端だと、短い線で別の線のつぎ目に見える）
//   書き始めには、チョークが板に噛んだ小さな濃い点（bite）
// その上から、粉が板の凹に乗らない所（点の抜け）を Mask の穴で開ける（地の色を知らなくても、下の地がそのまま見える）。
// 穴は細かい点を一面に散らした模様（Pattern）。線の向きに関係なく同じように散り、縁にかかった点は線の縁をざらつかせる。
// 動き: start が true になったら delay 待って duration で、書き始めから引く（ease.drag＝引きずる速さ）。動きを減らすなら引き終わった形。
//   const u = bezier([1, 3], [[[30, 1.2], [70, 3.6], [102, 1.4]]]);
//   <Svg …><ChalkStroke d={u.d} length={u.len} color={colors.used} width={2.8} start delay={300} duration={520} seed={7} /></Svg>

import { useMemo } from "react";
import { Animated } from "react-native";
import { Defs, G, Mask, Path, Pattern, Rect } from "react-native-svg";
import { ease, speckPaths, useDraw, useSvgId } from "./draw";

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Props = {
  d: string;
  length: number; // 線の長さ（bezier() の len）
  color: string;
  width: number;
  start: boolean;
  delay?: number;
  duration: number;
  easing?: (t: number) => number;
  seed?: number; // 抜けの並びの種
  unit?: number; // 1 の座標が何 px か（viewBox で縮めたアイコンの中で使うとき）
  density?: boolean; // 濃さの段（既定 true。ごく短い線では false）
  holes?: boolean; // 点の抜け（既定 true）
  transform?: string;
  opacity?: number;
};

// 点の模様の1枚の大きさ（画面の上の px）
const TILE = 46;

// 濃さの段: [線の頭からの割合, 不透明度]。重ねた濃さが 1（〜65%）→ 0.93（〜80%）→ 0.85（〜92%）→ 0.72（終わり）になる組み合わせ
const STEPS: readonly [number, number][] = [
  [1, 0.72],
  [0.92, 0.464],
  [0.8, 0.533],
  [0.65, 1],
];

export function ChalkStroke({
  d,
  length,
  color,
  width,
  start,
  delay = 0,
  duration,
  easing = ease.drag,
  seed = 1,
  unit = 1,
  density = true,
  holes = true,
  transform,
  opacity = 1,
}: Props) {
  const id = useSvgId("chalkStroke");
  const a = useDraw(length, width, start, delay, duration, easing);
  // 頭から part の長さだけの線: ペン先が届いた所までだけ見せる（MarkerStroke と同じ考え方）
  const part = (p: number) =>
    a.offset.interpolate({
      inputRange: [a.full - length * p, a.full],
      outputRange: [0, length * p],
      extrapolate: "clamp",
    });
  const common = { d, stroke: color, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const bite = Math.min(0.06, 5 / Math.max(1, length * unit));
  const specks = useMemo(() => (holes ? speckPaths(seed, TILE / unit, unit) : []), [holes, seed, unit]);
  return (
    <G transform={transform} opacity={opacity}>
      {holes && (
        <Defs>
          <Pattern id={`${id}p`} patternUnits="userSpaceOnUse" x={0} y={0} width={TILE / unit} height={TILE / unit}>
            {specks.map((p) => (
              <Path key={p.tone} d={p.d} fill={p.tone} />
            ))}
          </Pattern>
          <Mask id={id} maskUnits="userSpaceOnUse" x={-1000} y={-1000} width={4000} height={4000}>
            <Rect x={-1000} y={-1000} width={4000} height={4000} fill="#FFFFFF" />
            <Rect x={-1000} y={-1000} width={4000} height={4000} fill={`url(#${id}p)`} />
          </Mask>
        </Defs>
      )}
      <G mask={holes ? `url(#${id})` : undefined}>
        {density ? (
          STEPS.map(([p, o]) => (
            <AnimatedPath
              key={p}
              {...common}
              strokeLinecap={p === 1 ? "round" : "butt"}
              strokeWidth={width}
              strokeDasharray={p === 1 ? a.dash : `${length * p} ${length * 3}`}
              strokeDashoffset={p === 1 ? a.offset : part(p)}
              opacity={a.opacity.interpolate({ inputRange: [0, 1], outputRange: [0, o] })}
            />
          ))
        ) : (
          <AnimatedPath
            {...common}
            strokeWidth={width}
            strokeDasharray={a.dash}
            strokeDashoffset={a.offset}
            opacity={a.opacity}
          />
        )}
        {/* 書き始めの噛んだ点（少しだけ太く濃い） */}
        {density && (
          <AnimatedPath
            {...common}
            strokeWidth={width + 0.5 / unit}
            strokeDasharray={`${length * bite} ${length * 3}`}
            strokeDashoffset={part(bite)}
            opacity={a.opacity}
          />
        )}
      </G>
    </G>
  );
}
