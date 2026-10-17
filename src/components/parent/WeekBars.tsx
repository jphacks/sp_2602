// 保護者の画面の棒グラフ（親01 今週の使用時間・親03 週ごとの平均・親02 上限の下がり方）。データは charts.ts の ChartBar。
// 共通の BarChart との違い: 1本ごとに中身の色（淡い青 / 青）・下地なし・「？」の印・下の札（「今週」「前の試験」）を選べる。
// 棒の高さは値で決まるので、ここだけ計算した style を使う（色・寸法は tokens のまま）。
//   <WeekBars bars={homeWeekBars(days, today)} accessibilityLabel="今週の使用時間" />
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components";
import { type ChartBar, chartNotes } from "./charts";

type Props = { bars: ChartBar[]; accessibilityLabel?: string };

export function WeekBars({ bars, accessibilityLabel }: Props) {
  const max = Math.max(1, ...bars.flatMap((b) => [b.track ?? 0, b.value ?? 0]));
  const h = (n: number) => ({ height: Math.round((Math.min(n, max) / max) * tokens.size.chartHeight) });
  const notes = chartNotes(bars);
  return (
    <View style={styles.wrap}>
      <View style={styles.row} accessibilityLabel={accessibilityLabel}>
        {bars.map((b) => (
          <View key={b.key} style={styles.col} accessible accessibilityLabel={b.a11y}>
            <AppText variant="caption" tone={b.emphasis ? "primary" : "muted"}>
              {b.topLabel}
            </AppText>
            <View style={styles.area}>
              {b.track != null ? (
                <View style={[styles.track, h(Math.max(b.track, b.value ?? 0))]}>
                  {b.value != null && <View style={[styles.fill, fills[b.fill], h(b.value)]} />}
                </View>
              ) : b.value != null ? (
                <View style={[styles.fill, styles.bare, fills[b.fill], h(b.value)]} />
              ) : null}
              {b.missing && (
                <AppText variant="caption" tone="muted" center>
                  ？
                </AppText>
              )}
            </View>
            {/* 強調する棒（今日など）は青の太字（Figma 親01 の「木 10/15」）。
                2行目がないとき（親03 の週の「10/12」）は日付なので小さい文字にする（大きいと隣の日付とくっつく） */}
            <AppText
              variant={b.sublabel ? "label" : "micro"}
              tone={b.emphasis ? "primary" : "default"}
              strong={b.emphasis}
            >
              {b.label}
            </AppText>
            {b.sublabel ? (
              <AppText variant="micro" tone={b.emphasis ? "primary" : "muted"} strong={b.emphasis}>
                {b.sublabel}
              </AppText>
            ) : null}
            {b.tags.map((t) => (
              // 札（「今の試験」など）は棒の幅より広いので、1行のまま棒の左右にはみ出して出す（Figma 親03）
              <View key={t.label} style={styles.tagRow}>
                <View style={[styles.tag, tags[t.tone]]}>
                  <AppText
                    variant="micro"
                    strong
                    numberOfLines={1}
                    tone={t.tone === "strong" ? "onPrimary" : "onPrimarySoft"}
                  >
                    {t.label}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
      {notes.map((n) => (
        <AppText key={n} variant="caption" tone="muted">
          {n}
        </AppText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.space[2] },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  col: { flex: 1, alignItems: "center", gap: tokens.space[1] },
  area: { height: tokens.size.chartHeight, justifyContent: "flex-end", alignItems: "center" },
  track: {
    width: tokens.size.chartBarWidth,
    backgroundColor: tokens.color.track,
    borderRadius: tokens.radius.sm,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  fill: { width: "100%", borderRadius: tokens.radius.sm },
  bare: { width: tokens.size.chartBarWidth },
  tagRow: { width: tokens.size.chartTagWidth, alignItems: "center" },
  tag: { paddingHorizontal: tokens.space[1], borderRadius: tokens.radius.sm },
});

const fills = StyleSheet.create({
  muted: { backgroundColor: tokens.color.primaryMuted },
  strong: { backgroundColor: tokens.color.primary },
});

const tags = StyleSheet.create({
  strong: { backgroundColor: tokens.color.primary },
  soft: { backgroundColor: tokens.color.primarySoft },
});
