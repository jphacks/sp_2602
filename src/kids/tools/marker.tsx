// tmp/animations/rnweb/whiteboard/tools/marker.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// ホワイトボードの道具（マーカー）。役目の部品（tools/index.tsx の Tool）を、marker/ の描き方につなぐ。
// 値は theme/tool.ts の markerTool。ほかの道具（chalk・pencil）を足すときは、このファイルと同じ形の tools/<道具>.tsx を作る。
import { useMemo } from "react";
import type { Animated } from "react-native";
import { ease } from "../marker/draw";
import { HandBox, HandFrame } from "../marker/HandBox";
import { MarkerBar } from "../marker/MarkerBar";
import { MarkerBarColumn } from "../marker/MarkerBarColumn";
import { MarkerCheck } from "../marker/MarkerCheck";
import { MarkerHighlightLine } from "../marker/MarkerHighlightLine";
import { MarkerRing } from "../marker/MarkerRing";
import { MarkerSpinner } from "../marker/MarkerSpinner";
import { MarkerUnderline } from "../marker/MarkerUnderline";
import { PenTray } from "../marker/PenTray";
import { markerTool, stroke, timing } from "../theme/tool";
import type { FrameLineProps, FrameProps, Tool, UnderlineProps } from "./index";
import { useToolColors } from "./scheme-colors";

// 手描きの枠。ホワイトボードは地を塗らない（ボードに直接書く）ので kind による違いはない。small（行の中の小さい札）は線を細く・角を小さく
function Frame({ size = "normal", kind: _kind, tone: _tone, ...rest }: FrameProps) {
  return (
    <HandBox
      {...rest}
      width={size === "small" ? 1.6 : stroke.box}
      radius={size === "small" ? 6 : markerTool.frame.radius}
    />
  );
}

// 枠の線だけ。emphasis（0〜1）で 2.3 → 3.2 に太くする
function FrameLine({ w, h, seed, emphasis }: FrameLineProps) {
  const width = useMemo(
    () =>
      emphasis
        ? (emphasis as Animated.Value).interpolate({ inputRange: [0, 1], outputRange: [stroke.box, stroke.boxFocus] })
        : stroke.box,
    [emphasis],
  );
  return <HandFrame w={w} h={h} seed={seed} width={width} />;
}

// 短い下線: タブ＝濃い色（usedLine）3・200ms でキュッ / 上限の帯＝使った時間の色（used）3.4・300ms 待って 420ms。色は今の配色
function Underline({ width, active, kind }: UnderlineProps) {
  const colors = useToolColors("marker");
  if (kind === "reached")
    return (
      <MarkerHighlightLine
        width={width}
        active={active}
        color={colors.used}
        thickness={stroke.reached}
        delay={timing.reachedDelay}
        duration={timing.reached}
        easing={ease.reached}
      />
    );
  return (
    <MarkerHighlightLine
      width={width}
      active={active}
      color={colors.usedLine}
      thickness={stroke.tab}
      duration={timing.highlight}
      wave={0.3}
    />
  );
}

export const markerKit: Tool = {
  values: markerTool,
  Frame,
  FrameLine,
  UsedBar: ({ length, thin }) => <MarkerBar length={length} thin={thin} />,
  TestMark: (p) => <MarkerUnderline {...p} />, // fontSize で大きな数字の下線を離す
  Ring: ({ progress, size }) => <MarkerRing progress={progress} size={size} />,
  BarColumn: (p) => <MarkerBarColumn {...p} />,
  Check: (p) => <MarkerCheck {...p} />,
  Spinner: (p) => <MarkerSpinner {...p} />,
  Underline,
  TabBackground: PenTray,
};
