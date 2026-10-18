// tmp/animations/rnweb/whiteboard/chalk/ChalkPillLine.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 線だけの丸いボタンの線（黒板。Button の outline・soft・pill）。Button が箱の左上 (0,0) から w×h に置く。
// 丸いボタンの形は、型やコンパスで書いたなめらかな線（揺らさない）。でもチョークなので粉の点の抜けがある。
// 押している間は、強く押しつけた線（抜けのない 2 の線）。形は Figma の outline（チョークの白 1.5 の丸い線）。
import { useMemo } from "react";
import Svg, { Defs, G, Mask, Rect } from "react-native-svg";
import { chalk, chalkStroke } from "../theme/chalk";
import type { ButtonLineProps } from "../tools";
import { holeLanes, useSvgId } from "./draw";

export function ChalkPillLine({ w, h, pressed = false }: ButtonLineProps) {
  const id = useSvgId("chalkPill");
  const sw = pressed ? chalkStroke.buttonPressed : chalkStroke.button;
  const lanes = useMemo(() => holeLanes(chalkStroke.button, Math.round(w) + 3), [w]);
  if (w <= 0 || h <= 0) return null;
  const box = (o: number) => ({
    x: sw / 2 + o,
    y: sw / 2 + o,
    width: Math.max(0, w - sw - o * 2),
    height: Math.max(0, h - sw - o * 2),
    rx: Math.max(0, (h - sw) / 2 - o),
  });
  return (
    <Svg pointerEvents="none" width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }}>
      <Defs>
        <Mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}>
          <Rect x={0} y={0} width={w} height={h} fill="#FFFFFF" />
          {!pressed &&
            lanes.map((l, i) => (
              <Rect
                key={i}
                {...box(l.off)}
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
        <Rect {...box(0)} fill="none" stroke={chalk.ink} strokeWidth={sw} />
      </G>
    </Svg>
  );
}
