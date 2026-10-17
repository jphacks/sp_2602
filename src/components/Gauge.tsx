// 円形ゲージ（子02 の「今日の使用量」。240×240・中央に数字）。percent は 0〜100 の使用済みの割合（C3 の displayUsedPercent）。
// 値が分からないとき（取得不可）は percent に null を渡すと「--」を出す（0% と表示しない）。
//   <Gauge percent={calc.state === "ok" ? calc.displayUsedPercent : null} caption="使いました" />
// 中央の数字の色は valueTone で選べる（既定は弧と同じ色。Figma 子02 は黒 = "default"）
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useColors } from "@/lib/theme";
import { AppText } from "./AppText";

type Props = {
  percent: number | null;
  caption?: string;
  tone?: "primary" | "danger"; // 弧の色
  valueTone?: "primary" | "danger" | "default"; // 中央の数字と「％」の色（省くと弧と同じ色）
};

export function Gauge({ percent, caption, tone = "primary", valueTone }: Props) {
  const colors = useColors();
  const size = tokens.size.ring;
  const stroke = tokens.size.ringStroke;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = percent == null ? 0 : Math.min(100, Math.max(0, percent));
  const color = tone === "danger" ? colors.danger : colors.primaryFill;
  const numberTone = valueTone ?? tone;
  return (
    <View
      style={styles.box}
      accessibilityRole="progressbar"
      accessibilityLabel={percent == null ? "使用量は分かりません" : `${Math.round(p)}パーセント${caption ?? ""}`}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.track} strokeWidth={stroke} fill="none" />
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
          <AppText variant="ring" tone={numberTone}>
            {percent == null ? "--" : Math.round(p)}
          </AppText>
          <AppText variant="title" tone={numberTone}>
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
