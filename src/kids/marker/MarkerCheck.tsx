// tmp/animations/rnweb/whiteboard/marker/MarkerCheck.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 成功のチェック（子04・子05-C の登録完了のダイアログ、子19 の連携完了）。黒マーカーでチェックを1画で引く（短い払い → 長い払い）。
// 時間: 出てから 120ms 後に 320ms（指示書 3 章）。動きを減らすなら、最初から引いた形。
// ring で、まわりに手描きの丸（Doodle の check_circle の丸）を付ける（ダイアログの check_circle と同じ形。丸は動かさない）。
//   <MarkerCheck size={32} start={visible} ring />     … ダイアログの上のアイコン
//   <MarkerCheck size={48} start />                    … IconBadge の中（子19）
import { View } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import iconData from "../theme/icons.json";
import { marker, stroke, timing } from "../theme/tool";
import { bezier, ease } from "./draw";
import { MarkerStroke } from "./MarkerStroke";

// 24 の箱の中のチェックの線（Doodle の check と同じ大きさ・同じ傾き）
const CHECK = bezier(
  [4.2, 12.9],
  [
    [
      [5.9, 14.7],
      [7.6, 16.5],
      [9.4, 18.3],
    ],
    [
      [12.9, 13.7],
      [16.6, 9.4],
      [20.2, 5.6],
    ],
  ],
);
// 丸の中に入れるときのチェック（少し小さく、丸の真ん中へ）
// （Doodle の check_circle と同じく、丸の右上の切れ目から外へ抜ける）
const CHECK_IN_RING = bezier(
  [8.0, 12.1],
  [
    [
      [9.0, 13.2],
      [10.0, 14.3],
      [11.0, 15.3],
    ],
    [
      [14.4, 11.6],
      [17.7, 8.2],
      [21.0, 4.9],
    ],
  ],
);

// check_circle の丸だけ（Doodle の形の1本目の path。描くときに色を差し替える）
const ringXml = (() => {
  const svg = (iconData as Record<string, string>).check_circle ?? "";
  const g = svg.match(/<g transform="([^"]+)">(<path d="[^"]+"[^>]*\/>)/);
  return g?.[1] && g[2] ? { transform: g[1], d: g[2].match(/d="([^"]+)"/)?.[1] ?? "" } : null;
})();

type Props = { size: number; start: boolean; ring?: boolean; color?: string; delay?: number; duration?: number };

export function MarkerCheck({
  size,
  start,
  ring = false,
  color = marker.ink,
  delay = timing.checkDelay,
  duration = timing.check,
}: Props) {
  const line = ring ? CHECK_IN_RING : CHECK;
  // 太さは 48 の大きさで 2.6 → 24 の箱では 1.3 × 2（大きさに比例。細くなりすぎないよう 24 の箱で 1.6 以上）
  const sw = Math.max(1.6, (stroke.check * 24) / 48);
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
        <MarkerStroke
          d={line.d}
          length={line.len}
          color={color}
          width={sw}
          start={start}
          delay={delay}
          duration={duration}
          easing={ease.draw}
        />
      </Svg>
    </View>
  );
}
