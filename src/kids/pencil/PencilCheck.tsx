// tmp/animations/rnweb/whiteboard/pencil/PencilCheck.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 成功のチェック（子04・子05-C の登録完了・子19 の連携完了・子06 のテーマの選択）。鉛筆で書く（EXPRESSION.md 1-12）。
// 赤ペンの丸つけは「正解」の意味で、赤はテストの色（印・残りの日数）と意味がまざるので使わない（決まり「成功＝ノートは鉛筆」）。
//   - チェック: 短い払いのあと長く払い上げ、最後は鉛筆を上げるので細く抜ける（PencilStroke の lift）
//   - ring（check_circle）: まず手で丸を書き（右上から左回り。閉じきらず、右上はチェックの抜け道）、40ms おいてチェック
// 時間: 出てから 120ms 待って、丸 260ms → 40ms → チェック 300ms。duration を渡されたら（テーマの選択の 200ms）チェックはその時間。
//   <PencilCheck size={32} start={visible} ring />
import { useMemo } from "react";
import { View } from "react-native";
import Svg from "react-native-svg";
import { pencil, pencilStroke, pencilTiming } from "../theme/pencil";
import { bezier, handCircle, pencilEase } from "./draw";
import { PencilStroke } from "./PencilStroke";

// 24 の箱の中のチェック（Doodle の check と同じ大きさ・同じ傾き。marker/MarkerCheck と同じ骨組み）
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
// 丸の中のチェック（丸の右上の切れ目から外へ抜ける）
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

type Props = { size: number; start: boolean; ring?: boolean; color?: string; delay?: number; duration?: number };

export function PencilCheck({
  size,
  start,
  ring = false,
  color = pencil.lead,
  delay = pencilTiming.checkDelay,
  duration = pencilTiming.check,
}: Props) {
  const circle = useMemo(() => handCircle(7), []);
  const line = ring ? CHECK_IN_RING : CHECK;
  // 太さ: 24 の箱で 1.4（大きさに比例して見えるよう、箱が小さいときは少し太く。最低 1.2 px に見える太さ）
  const sw = Math.max(pencilStroke.check, (1.2 * 24) / size);
  const checkAt = ring ? delay + pencilTiming.checkRing + pencilTiming.checkGap : delay;
  return (
    <View
      pointerEvents="none"
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {ring && (
          <PencilStroke
            d={circle.d}
            length={circle.len}
            color={color}
            width={sw * 0.85}
            start={start}
            delay={delay}
            duration={pencilTiming.checkRing}
            lift={0.15}
            opacity={0.85}
          />
        )}
        <PencilStroke
          d={line.d}
          length={line.len}
          color={color}
          width={sw}
          start={start}
          delay={checkAt}
          duration={duration}
          easing={pencilEase.flick}
          lift={0.3}
        />
      </Svg>
    </View>
  );
}
