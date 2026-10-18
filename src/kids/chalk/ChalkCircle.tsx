// tmp/animations/rnweb/whiteboard/chalk/ChalkCircle.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// テストの日付の印（黒板）: ピンクのチョークで「10月28日（水）」全体を丸く囲む（先生が黒板で大事な日付を囲む形）。
// 形は確認ページ（rnweb/themes/parts.tsx の ChalkCircle）のまま: 文字の左右 12・上下 7 の外を通る楕円。手で書いた丸は閉じきらず、
// 書き始め（右上）を少し越えて終わる。線は 2.8、粉のかすれ（点の抜け）と、書き始め濃い・書き終わり薄い（ChalkStroke）。
// twice（3日以内・テスト中。child-view.ts の nextTestEmphasis）: もう一度、少しずらしてなぞる（左下から、2.2。Figma 子01-H の2本の線）。
// 時間: delay（既定 1000ms。数え上げのあと）から 620ms で1周。twice は +800ms から 480ms。速さは ease.drag（板の上を引きずる）。
// 使い方: 測った文字に重ねる（Measured。印は文字の後ろ）。
//   <Measured mark={(w, h) => <ChalkCircle w={w} h={h} start={open} twice={emphasis} />}><Text>10月28日（水）</Text></Measured>
import Svg from "react-native-svg";
import { chalk, chalkStroke, chalkTiming } from "../theme/chalk";
import type { TestMarkProps } from "../tools";
import { ChalkStroke } from "./ChalkStroke";
import { bezier } from "./draw";

const PAD = 12;

export function ChalkCircle({ w, h, start, twice = false, delay = chalkTiming.markAt }: TestMarkProps) {
  if (!w) return null;
  const W = w + PAD * 2;
  const H = h + 14;
  const one = bezier(
    [W * 0.82, 4],
    [
      [
        [W * 0.55, -1],
        [W * 0.12, 0.5],
        [3, H * 0.42],
      ],
      [
        [-1, H * 0.86],
        [W * 0.3, H + 1],
        [W * 0.62, H - 1.5],
      ],
      [
        [W * 0.9, H - 3],
        [W + 1, H * 0.55],
        [W - 3, H * 0.28],
      ],
      [
        [W - 6, H * 0.1],
        [W * 0.72, 1],
        [W * 0.56, 2.5],
      ],
    ],
  );
  const two = bezier(
    [W * 0.2, H - 2],
    [
      [
        [W * 0.55, H + 2],
        [W - 1, H * 0.8],
        [W - 2, H * 0.45],
      ],
      [
        [W - 3, H * 0.05],
        [W * 0.4, -1],
        [4, H * 0.3],
      ],
    ],
  );
  return (
    <Svg
      pointerEvents="none"
      width={W + 6}
      height={H + 6}
      style={{ position: "absolute", left: -PAD - 3, top: -10 }}
      viewBox={`-3 -3 ${W + 6} ${H + 6}`}
    >
      <ChalkStroke
        d={one.d}
        length={one.len}
        color={chalk.test}
        width={chalkStroke.circle}
        start={start}
        delay={delay}
        duration={chalkTiming.circle}
        seed={Math.round(w) + 3}
      />
      {twice && (
        <ChalkStroke
          d={two.d}
          length={two.len}
          color={chalk.test}
          width={chalkStroke.circle2}
          start={start}
          delay={delay + chalkTiming.circle2After}
          duration={chalkTiming.circle2}
          seed={Math.round(w) + 17}
        />
      )}
    </Svg>
  );
}
