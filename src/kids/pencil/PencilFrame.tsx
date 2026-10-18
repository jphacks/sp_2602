// tmp/animations/rnweb/whiteboard/pencil/PencilFrame.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 鉛筆の枠（ノートのカード・帯・ダイアログ・入力欄・リストの行・札）。
// 子どもが鉛筆で箱を描いた形: 4辺を1本ずつ引き（HandBox の式。角 4・揺れ 0.8・芯 #3C3C3C・太さ 1.5）、
//   - 4辺を別々の線にして少し透ける濃さ（0.88）にするので、角で重なった所が自然に濃くなる
//   - 各辺の書き始めの 3 割に、もう1回うすく重ねる（鉛筆を置いた所の濃さ。マーカーのように太くはしない）
//   - 上に紙の粒を重ねて、線と文字を少しかすれさせる
// 地: カード・帯・行・札は半透明の紙（中の罫を薄くする）。ダイアログは「ノートを切り取った紙」（透けない紙＋中にも罫）。
// 枠は動かさない（毎回同じ形。seed で決まる）。中身の押す操作は邪魔しない（線と粒は pointerEvents="none"）。
//   <PencilFrame seed={3} kind="card" style={{ padding: 20 }}>…</PencilFrame>
// 入力欄の線だけ（PencilFrameLine）は、emphasis（0〜1）で「もう一度なぞる」: 1本目を 1.5 → 2.0 に太くしながら、
// 少しずらした2本目の線を 0 → 1 の濃さで重ねる（EXPRESSION.md 1-2）。
import { type ReactNode, useMemo } from "react";
import { Animated, type StyleProp, StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { pencil, pencilStroke, pencilTool } from "../theme/pencil";
import { handBoxSides, sideLengths, useSize } from "./draw";
import { Grain } from "./Grain";
import { PaperRules } from "./NoteRules";

const AnimatedPath = Animated.createAnimatedComponent(Path);

type AnimNum = Animated.Value | Animated.AnimatedInterpolation<number>;
type Kind = "card" | "banner" | "dialog" | "row" | "chip" | "field";

const LINE_OPACITY = 0.88; // 1本の線の濃さ（重なった所が濃くなるよう、少し透ける）
const PRESS = 0.3; // 書き始めの濃い所の長さ（辺の長さに対して）

// 4辺の鉛筆の線（大きさの分かった箱の上に重ねる）
export function PencilLines({
  w,
  h,
  seed,
  width = pencilStroke.frame,
  radius = pencilTool.frame.radius,
  wobble = pencilTool.frame.wobble,
  color = pencil.lead,
  opacity = LINE_OPACITY,
}: {
  w: number;
  h: number;
  seed: number;
  width?: number | AnimNum;
  radius?: number;
  wobble?: number;
  color?: string;
  opacity?: number;
}) {
  const sides = useMemo(() => handBoxSides(w, h, radius, seed, wobble), [w, h, radius, seed, wobble]);
  const lens = sideLengths(w, h);
  const P = typeof width === "number" ? Path : AnimatedPath;
  const common = {
    stroke: color,
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: width as never,
  };
  return (
    <Svg
      pointerEvents="none"
      width={w + 12}
      height={h + 12}
      style={{ position: "absolute", left: -6, top: -6 }}
      viewBox={`-6 -6 ${w + 12} ${h + 12}`}
    >
      {sides.map((d, i) => (
        <P key={i} d={d} {...common} opacity={opacity} />
      ))}
      {/* 書き始めの濃さ（押した所） */}
      {sides.map((d, i) => (
        <P
          key={`p${i}`}
          d={d}
          {...common}
          opacity={opacity * 0.38}
          strokeDasharray={`${(lens[i] ?? w) * PRESS} ${(lens[i] ?? w) * 3}`}
        />
      ))}
    </Svg>
  );
}

type FrameProps = Omit<ViewProps, "style" | "children"> & {
  seed: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  kind?: Kind;
  size?: "normal" | "small";
};

export function PencilFrame({ seed, style, children, kind = "card", size = "normal", onLayout, ...rest }: FrameProps) {
  const [{ w, h }, measure] = useSize();
  const small = size === "small";
  const dialog = kind === "dialog";
  const radius = small ? 3 : pencilTool.frame.radius;
  return (
    <View
      {...rest}
      // 地は呼ぶ側の style が上書きできるよう先に（押している行の地など）
      style={[{ backgroundColor: dialog ? pencil.paper : pencil.cardPaper, borderRadius: radius }, style]}
      onLayout={(e) => {
        measure(e);
        onLayout?.(e);
      }}
    >
      {/* ダイアログは切り取ったノートの紙: 紙の中にも罫（中身の後ろ） */}
      {dialog && w > 0 && <PaperRules width={w} height={h} first={26} radius={radius} />}
      {children}
      {w > 0 && (
        <PencilLines
          w={w}
          h={h}
          seed={seed}
          width={small ? pencilStroke.frameSmall : pencilStroke.frame}
          radius={radius}
        />
      )}
      <Grain radius={radius} />
    </View>
  );
}

// 枠の線だけ（入力欄・テーマの選択肢）。emphasis（0〜1）で、もう一度なぞる
export function PencilFrameLine({
  w,
  h,
  seed,
  emphasis,
}: {
  w: number;
  h: number;
  seed: number;
  emphasis?: AnimNum;
  kind?: Kind;
}) {
  const width = useMemo(
    () =>
      emphasis
        ? (emphasis as Animated.Value).interpolate({
            inputRange: [0, 1],
            outputRange: [pencilStroke.frame, pencilStroke.frameStrong],
          })
        : pencilStroke.frame,
    [emphasis],
  );
  return (
    // 中身（文字）の後ろに敷く（zIndex -1）: 半透明の紙で欄の中の罫を薄くし、線は文字にかからない
    <View pointerEvents="none" style={styles.under}>
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: pencil.cardPaper, borderRadius: pencilTool.frame.radius }]}
      />
      <PencilLines w={w} h={h} seed={seed} width={width} />
      {emphasis && (
        // なぞり直した2本目（別の種・少しずらす・少し揺れが大きい）
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: emphasis }]}>
          <View style={styles.retrace}>
            <PencilLines
              w={w}
              h={h}
              seed={seed + 101}
              width={1.3}
              wobble={pencilTool.frame.wobble * 1.3}
              opacity={0.8}
            />
          </View>
        </Animated.View>
      )}
      <Grain radius={pencilTool.frame.radius} opacity={0.8} />
    </View>
  );
}

const styles = StyleSheet.create({
  under: { ...StyleSheet.absoluteFill, zIndex: -1 },
  retrace: { ...StyleSheet.absoluteFill, transform: [{ translateX: 0.5 }, { translateY: 0.4 }] },
});
