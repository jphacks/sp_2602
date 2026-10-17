// 週の棒グラフ（子02「今週の使用割合」・親01「今週の使用時間（分）」・親03）。棒の幅 28。
// 1本ごとに「下地（上限）」と「中身（使った量）」を重ねる。value が null の日は中身を描かない（記録なし・未来の日。0 と区別する）。
//   親（分）: <BarChart bars={days.map(d => ({ key: d.date, label: "月", sublabel: "10/12", value: d.usedMinutes, capacity: d.limitMinutes, topLabel: String(d.limitMinutes) }))} />
//   子（%） : <BarChart bars={… value: 割合, capacity: 100 …} scaleMax={100} />
// 棒の高さは値で決まるので、ここだけ計算した style を使う（色・寸法は tokens のまま）。
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import { AppText } from "./AppText";

export type Bar = {
  key: string;
  label: string; // 下の1行目（曜日）
  sublabel?: string; // 下の2行目（日付）
  value: number | null; // 使った量（null = 記録なし）
  capacity: number | null; // 下地の高さに使う値（上限。null なら一番上まで）
  topLabel?: string; // 棒の上の数字（上限の分数など）
  highlight?: boolean; // 今日（濃い色）
};

// compact: 子02 の小さいグラフ（棒の高さ 90）。ゲージと同じ画面に収めるため
type Props = { bars: Bar[]; scaleMax?: number; accessibilityLabel?: string; compact?: boolean };

export function BarChart({ bars, scaleMax, accessibilityLabel, compact = false }: Props) {
  const max =
    scaleMax ?? Math.max(1, ...bars.flatMap((b) => [b.capacity ?? 0, b.value ?? 0]).filter((n) => Number.isFinite(n)));
  const height = compact ? tokens.size.chartHeightSmall : tokens.size.chartHeight;
  const h = (n: number) => ({ height: Math.round((Math.min(n, max) / max) * height) });
  // 棒の上の数字の行は、どれかの棒に数字があるときだけ空ける（子02 は数字がないので空けない）
  const hasTop = bars.some((b) => b.topLabel != null);
  return (
    <View style={styles.row} accessibilityLabel={accessibilityLabel}>
      {bars.map((b) => (
        <View key={b.key} style={styles.col}>
          {hasTop && (
            <AppText variant="caption" tone={b.highlight ? "primary" : "muted"}>
              {b.topLabel ?? " "}
            </AppText>
          )}
          <View style={[styles.area, compact && styles.areaSmall]}>
            <View style={[styles.track, h(b.capacity ?? max)]}>
              {b.value != null && <View style={[styles.fill, b.highlight && styles.today, h(b.value)]} />}
            </View>
          </View>
          {/* 今日は青の太字（Figma 子02 の「木 10/15」） */}
          <AppText variant="label" tone={b.highlight ? "primary" : "default"} strong={b.highlight}>
            {b.label}
          </AppText>
          {b.sublabel ? (
            <AppText variant="micro" tone={b.highlight ? "primary" : "muted"} strong={b.highlight}>
              {b.sublabel}
            </AppText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// 凡例（色見本＋文字）。幅が足りないときは折り返す（親03 は凡例が3つで1行に入らない）
export function Legend({ items }: { items: { label: string; tone: "track" | "fill" | "today" }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((i) => (
        <View key={i.label} style={styles.legendItem}>
          <View style={[styles.swatch, swatch[i.tone]]} />
          <AppText variant="caption" tone="muted">
            {i.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  col: { alignItems: "center", gap: tokens.space[1] },
  area: { height: tokens.size.chartHeight, justifyContent: "flex-end" },
  areaSmall: { height: tokens.size.chartHeightSmall },
  track: {
    width: tokens.size.chartBarWidth,
    backgroundColor: tokens.color.track,
    borderRadius: tokens.radius.sm,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  fill: { width: "100%", backgroundColor: tokens.color.primaryMuted, borderRadius: tokens.radius.sm },
  today: { backgroundColor: tokens.color.primary },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: tokens.space[3], rowGap: tokens.space[1] },
  legendItem: { flexDirection: "row", alignItems: "center", gap: tokens.space[1] },
  swatch: { width: tokens.size.legendSwatch, height: tokens.size.legendSwatch, borderRadius: tokens.radius.sm },
});

const swatch = StyleSheet.create({
  track: { backgroundColor: tokens.color.track },
  fill: { backgroundColor: tokens.color.primaryMuted },
  today: { backgroundColor: tokens.color.primary },
});
