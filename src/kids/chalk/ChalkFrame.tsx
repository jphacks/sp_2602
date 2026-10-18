// tmp/animations/rnweb/whiteboard/chalk/ChalkFrame.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 黒板の枠（カード・帯・ダイアログ・行・札・入力欄）。先生が黒板用の定規で引いた囲みなので、線はまっすぐで揺れない（ホワイトボードの
// 手で4辺を引いた揺れる線にしない）。でも粉は板の凹に乗らないので、線も中の文字も少しかすれる。
// 形（Figma 34:2110・chalk-prelude の card・banner・dialog・field・chip）:
//   card・dialog・row … 一段明るい黒板（surface）＋枠の線 #C9D2C8 1.25・角 6＋粒
//   banner          … 一段明るい黒板＋粒。囲みの線は引かない（明るい所に書いた補足）
//   chip            … 地なし・枠の線 1.25 の丸い札（両端が半円）。small は 1
//   field           … 地なし・チョークの白 1.25・角 6（書き込む所ははっきり白）
// 作り:
//   - 地の上に、中身 → 粒（その地の色の点。中の文字・数字・線が少し欠ける＝「文字と線のかすれ」）→ 枠の線（SVG）の順に重ねる
//   - 枠の線は RN の border でなく SVG で引く（粒の 2px の点が 1.25 の線を定期的に切って点線に見えるのを避け、抜けの量を線ごとに決めるため。
//     ホワイトボードの手描きの枠と同じく、線は中身の置き場所を動かさない）
// 枠は動かさない（seed は抜けの並びだけに使う。定規の線は毎回同じ形）。中身の押す操作は邪魔しない（粒と線は pointerEvents="none"）。
import { useMemo } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Defs, G, Mask, Rect } from "react-native-svg";
import boardGrain from "../assets/chalk/board.png";
import cardGrain from "../assets/chalk/card.png";
import { chalk, chalkStroke, chalkTool } from "../theme/chalk";
import type { FrameKind, FrameLineProps, FrameProps } from "../tools";
import { useToolColors } from "../tools/scheme-colors";
import { holeLanes, useSize, useSvgId } from "./draw";
import { Speckle } from "./Speckle";

const AnimatedRect = Animated.createAnimatedComponent(Rect);
type AnimNum = Animated.Value | Animated.AnimatedInterpolation<number>;

const FILLED: ReadonlySet<FrameKind> = new Set(["card", "dialog", "row", "banner"]);

// 上に重ねる粒（Figma の NOISE と同じ。地の色の点が、線や文字を少し欠けさせる）
export function ChalkGrain({ filled, radius }: { filled: boolean; radius: number }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.grain, { borderRadius: radius }]}
    >
      <Speckle src={filled ? cardGrain : boardGrain} width={192} height={192} />
    </View>
  );
}

// 角の丸い四角の線（チョーク）。抜けのある線＋（emphasis があれば）強くなぞった抜けのない線
function RectLine({
  w,
  h,
  seed,
  color,
  width,
  radius,
  emphasis,
}: {
  w: number;
  h: number;
  seed: number;
  color: string;
  width: number;
  radius: number;
  emphasis?: AnimNum;
}) {
  const id = useSvgId("chalkRect");
  const lanes = useMemo(() => holeLanes(width, seed), [seed, width]);
  if (w <= 0 || h <= 0) return null;
  const strong = chalkStroke.frameStrong;
  // 線の真ん中が箱の縁から width/2 内側（線が箱の外へはみ出さない）
  const box = (sw: number, o = 0) => ({
    x: sw / 2 + o,
    y: sw / 2 + o,
    width: Math.max(0, w - sw - o * 2),
    height: Math.max(0, h - sw - o * 2),
    rx: Math.max(0, Math.min(radius, h / 2) - sw / 2 - o),
  });
  return (
    <Svg pointerEvents="none" width={w} height={h} style={styles.line}>
      <Defs>
        <Mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}>
          <Rect x={0} y={0} width={w} height={h} fill="#FFFFFF" />
          {lanes.map((l, i) => (
            <Rect
              key={i}
              {...box(width, l.off)}
              fill="none"
              stroke={l.tone}
              strokeWidth={l.dot}
              strokeLinecap="round"
              strokeDasharray={l.dash}
              strokeDashoffset={l.start}
            />
          ))}
        </Mask>
      </Defs>
      <G mask={`url(#${id})`}>
        <Rect {...box(width)} fill="none" stroke={color} strokeWidth={width} />
      </G>
      {emphasis && (
        <AnimatedRect {...box(strong)} fill="none" stroke={chalk.ink} strokeWidth={strong} opacity={emphasis} />
      )}
    </Svg>
  );
}

export function ChalkFrame({
  seed,
  style,
  children,
  kind = "card",
  size = "normal",
  tone,
  onLayout,
  ...rest
}: FrameProps) {
  const [{ w, h }, measure] = useSize();
  const colors = useToolColors("chalk");
  const filled = FILLED.has(kind);
  const line = kind === "banner" ? 0 : size === "small" ? chalkStroke.small : chalkStroke.frame;
  // テストの枠（次のテストのカード・一覧の印の付いた行）はテストの色のチョーク（今の配色。Figma 子01・子10・子10-C の黒板）
  const color = tone === "test" ? colors.test : kind === "field" ? chalk.ink : chalk.line;
  const pill = kind === "chip";
  const flat = StyleSheet.flatten(style) as ViewStyle | undefined;
  const radius = pill ? 999 : typeof flat?.borderRadius === "number" ? flat.borderRadius : chalkTool.frame.radius;
  return (
    <View
      {...rest}
      onLayout={(e) => {
        measure(e);
        onLayout?.(e);
      }}
      style={[
        { borderRadius: chalkTool.frame.radius },
        filled && { backgroundColor: chalk.surface },
        style,
        pill && { borderRadius: 999 },
      ]}
    >
      {children}
      <ChalkGrain filled={filled} radius={radius} />
      {line > 0 && <RectLine w={w} h={h} seed={seed} color={color} width={line} radius={radius} />}
    </View>
  );
}

// 大きさの分かった箱に重ねる枠の線だけ（入力欄・テーマの選択肢）。
// emphasis（0〜1。選んでいる・エラー）は「強くもう一度なぞる」: 抜けのない太さ 2 の線が、かすれた 1.25 の線の上に出る（粉が重なって抜けが埋まる）
export function ChalkFrameLine({ w, h, seed, emphasis, kind = "field" }: FrameLineProps) {
  return (
    <RectLine
      w={w}
      h={h}
      seed={seed}
      color={kind === "field" ? chalk.ink : chalk.line}
      width={chalkStroke.frame}
      radius={chalkTool.frame.radius}
      emphasis={emphasis}
    />
  );
}

const styles = StyleSheet.create({
  grain: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden", zIndex: 1 },
  line: { position: "absolute", left: 0, top: 0, zIndex: 2 },
});
