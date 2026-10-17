// 円形ゲージ（子02 の「今日の使用量」。240×240・中央に数字）。percent は 0〜100 の使用済みの割合（C3 の displayUsedPercent）。
// 値が分からないとき（取得不可）は percent に null を渡すと「--」を出す（0% と表示しない）。
//   <Gauge percent={calc.state === "ok" ? calc.displayUsedPercent : null} caption="使いました" />
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { AppText } from "./AppText";

type Props = { percent: number | null; caption?: string; tone?: "primary" | "danger" };

export function Gauge({ percent, caption, tone = "primary" }: Props) {
  const size = tokens.size.ring;
  const stroke = tokens.size.ringStroke;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = percent == null ? 0 : Math.min(100, Math.max(0, percent));
  const color = tone === "danger" ? tokens.color.danger : tokens.color.primary;
  return (
    <View
      style={styles.box}
      accessibilityRole="progressbar"
      accessibilityLabel={percent == null ? "使用量は分かりません" : `${Math.round(p)}パーセント${caption ?? ""}`}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={tokens.color.track} strokeWidth={stroke} fill="none" />
        {percent != null && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - p / 100)}
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        )}
      </Svg>
      <View style={styles.center}>
        <View style={styles.row}>
          <AppText variant="ring" tone={tone === "danger" ? "danger" : "primary"}>
            {percent == null ? "--" : Math.round(p)}
          </AppText>
          <AppText variant="title" tone="primary">
            ％
          </AppText>
        </View>
        {caption && <AppText variant="body">{caption}</AppText>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: tokens.size.ring, height: tokens.size.ring, alignSelf: "center" },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "baseline", gap: tokens.space[1] },
});
