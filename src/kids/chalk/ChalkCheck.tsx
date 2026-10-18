// tmp/animations/rnweb/whiteboard/chalk/ChalkCheck.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 成功のチェック（子04・子05-C の登録完了のダイアログ、子19 の連携完了、子06 の選んでいるテーマ）。
// 黒板にチョークでチェックを書くと「カッ、カッ」と2画になる: 下の角で向きを変えるとき、チョークは一瞬止まる（止まらないと折れる・すべる）。
// だから、短い払い → 止まり → 長い払い（3：1.4：4.6）。長い払いは角から少し戻った所に置き直して書き始める（角に小さな重なり）。
// 線はチョークの白（ink）1.8（24 の箱のとき。大きさに比例）。粉のかすれ・書き始め濃い・書き終わり薄い（ChalkStroke）。
// 時間: 既定は出てから 120ms 後に 450ms（150＋70＋230）。duration を渡されたら、その中で同じ割合。動きを減らすなら書き終わった形。
// ring で、まわりに check_circle の丸（アイコンの形のまま。動かさない）。
//   <ChalkCheck size={32} start={visible} ring />
import { View } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import { chalk, chalkStroke, chalkTiming } from "../theme/chalk";
import iconData from "../theme/icons.json";
import type { CheckProps } from "../tools";
import { ChalkStroke } from "./ChalkStroke";
import { bezier } from "./draw";

// 24 の箱の中のチェック（marker/MarkerCheck と同じ大きさ・傾き。2画に分けた）
const PLAIN = [
  bezier(
    [4.2, 12.9],
    [
      [
        [5.9, 14.7],
        [7.6, 16.5],
        [9.4, 18.3],
      ],
    ],
  ),
  bezier(
    [9.1, 17.9],
    [
      [
        [12.7, 13.6],
        [16.5, 9.4],
        [20.2, 5.6],
      ],
    ],
  ),
] as const;
const IN_RING = [
  bezier(
    [8.0, 12.1],
    [
      [
        [9.0, 13.2],
        [10.0, 14.3],
        [11.0, 15.3],
      ],
    ],
  ),
  bezier(
    [10.8, 15.0],
    [
      [
        [14.2, 11.5],
        [17.6, 8.2],
        [21.0, 4.9],
      ],
    ],
  ),
] as const;

const ringXml = (() => {
  const svg = (iconData as Record<string, string>).check_circle ?? "";
  const g = svg.match(/<g transform="([^"]+)">(<path d="[^"]+"[^>]*\/>)/);
  return g?.[1] && g[2] ? { transform: g[1], d: g[2].match(/d="([^"]+)"/)?.[1] ?? "" } : null;
})();

export function ChalkCheck({
  size,
  start,
  ring = false,
  delay = chalkTiming.checkDelay,
  duration = chalkTiming.check,
  color = chalk.ink,
}: CheckProps & { color?: string }) {
  const [a, b] = ring ? IN_RING : PLAIN;
  const unit = size / 24;
  const sw = chalkStroke.check;
  const first = (duration * 3) / 9;
  const pause = (duration * 1.4) / 9;
  const second = (duration * 4.6) / 9;
  return (
    <View
      pointerEvents="none"
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {ring && ringXml && (
          <G transform={ringXml.transform}>
            <Path d={ringXml.d} fill={color} />
          </G>
        )}
        <ChalkStroke
          d={a.d}
          length={a.len}
          color={color}
          width={sw}
          start={start}
          delay={delay}
          duration={first}
          unit={unit}
          seed={5}
        />
        <ChalkStroke
          d={b.d}
          length={b.len}
          color={color}
          width={sw}
          start={start}
          delay={delay + first + pause}
          duration={second}
          unit={unit}
          seed={9}
        />
      </Svg>
    </View>
  );
}
