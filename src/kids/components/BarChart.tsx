// tmp/animations/rnweb/whiteboard/components/BarChart.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 週の棒グラフ（ホワイトボード）。props・Bar・Legend と動きはアプリの BarChart（src/components/BarChart.tsx）と同じ。
// 形（Figma 子02・子02-B・子02-C）: 1本ごとに、上限までの道筋のうすい縦線（3px）と、太い緑マーカーで縦に引いた線（使った量）。
//   今日（highlight）は濃い緑、過去の日は少しインク切れのうすい緑（marker/MarkerBarColumn）。
//   下の曜日は 14（今日は太字）、日付は 12 の muted（今日は太字。色は道具の todayLabel か ink）。青は使わない
// 動き（src/lib/motion.ts と chart-motion.ts の決まりどおり。アプリと同じ）:
//   - 値が最初に分かった棒は、下から 0 → 値まで引く。左から順に（motion.stagger ずつ）、今日は一拍おいて最後
//   - 値が変わったとき（取り直し）は、今の長さから新しい長さへ
//   - value が null の棒（記録なし・未来の日）は引かず、道筋だけ（0 と区別する）
//   - 「動きを減らす」がオンなら、動かさずに最後の長さ

import { tokens } from "@contracts/tokens";
import { useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { barDelays, remainingDelay } from "@/components/chart-motion";
import { Text } from "@/kids/lib/text";
import { motion, useAnimatedNumber } from "@/lib/motion";
import { makeStyles, useColors } from "@/lib/theme";
import { makeToolStyles, useTool } from "../tools";
import { AppText } from "./AppText";

export type Bar = {
  key: string;
  label: string;
  sublabel?: string;
  value: number | null;
  capacity: number | null;
  topLabel?: string;
  highlight?: boolean;
};

type Props = { bars: Bar[]; scaleMax?: number; accessibilityLabel?: string; compact?: boolean; delay?: number };

// 少しでも使った日は、マーカーの丸い端が見える長さ（px）だけは引く
const MIN_LINE = 10;

export function BarChart({ bars, scaleMax, accessibilityLabel, compact = false, delay = 0 }: Props) {
  const styles = useStyles();
  const max =
    scaleMax ?? Math.max(1, ...bars.flatMap((b) => [b.capacity ?? 0, b.value ?? 0]).filter((n) => Number.isFinite(n)));
  const { values } = useTool();
  const lbl = useLabelStyles();
  const c = useColors();
  // 棒の場所の高さは道具ごと（ノートは鉛筆を立てるので高い。values.chart）。なければ tokens
  const height = compact
    ? (values.chart?.heightSmall ?? tokens.size.chartHeightSmall)
    : (values.chart?.height ?? tokens.size.chartHeight);
  // 今日の曜日・日付の色（黒板は黄チョーク: values.colors.todayLabel。なければ本文の色）
  const today = values.colors.todayLabel ?? c.text;
  const h = (n: number) => Math.round((Math.min(n, max) / max) * height);
  const hasTop = bars.some((b) => b.topLabel != null);
  // 動きの起点 = どれかの棒の値が最初に分かった時刻
  const origin = useRef<number | null>(null);
  if (origin.current == null && bars.some((b) => b.value != null)) origin.current = Date.now();
  const delays = barDelays(bars, { stagger: motion.stagger, emphasisGap: motion.stagger });
  return (
    <View style={styles.row} accessibilityLabel={accessibilityLabel}>
      {bars.map((b, i) => (
        <View key={b.key} style={styles.col}>
          {hasTop && (
            <AppText variant="caption" tone={b.highlight ? "default" : "muted"} strong={b.highlight}>
              {b.topLabel ?? " "}
            </AppText>
          )}
          <Column
            value={b.value}
            max={max}
            height={height}
            pathHeight={h(b.capacity ?? max)}
            today={b.highlight === true}
            plannedDelay={delay + (delays[i] ?? 0)}
            origin={origin.current}
          />
          {/* 曜日は 14、日付は 12 の muted（Figma 子02。アプリの 10 より大きい）。今日は太字 */}
          <Text style={[lbl.day, { color: b.highlight ? today : c.text }, b.highlight && lbl.strong]}>{b.label}</Text>
          {b.sublabel ? (
            <Text style={[lbl.date, { color: b.highlight ? today : c.muted }, b.highlight && lbl.strong]}>
              {b.sublabel}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

type ColumnProps = {
  value: number | null;
  max: number;
  height: number;
  pathHeight: number;
  today: boolean;
  plannedDelay: number;
  origin: number | null;
};

function Column({ value, max, height, pathHeight, today, plannedDelay, origin }: ColumnProps) {
  // 待ち時間は値が最初に分かったときに一度だけ決める（あとで変えると、動きがやり直しになる）
  const wait = useRef<number | null>(null);
  if (value != null && wait.current == null)
    wait.current = remainingDelay(plannedDelay, origin == null ? 0 : Date.now() - origin);
  const { value: level } = useAnimatedNumber(value, { duration: motion.duration.medium, delay: wait.current ?? 0 });
  const length = useMemo(() => {
    const minAt = Math.min(max, (max * MIN_LINE) / height);
    return level.interpolate({
      inputRange: [0, minAt * 0.001, minAt, max],
      outputRange: [0, MIN_LINE * 0.6, MIN_LINE, height],
      extrapolate: "clamp",
    });
  }, [level, max, height]);
  const { BarColumn } = useTool();
  return (
    <BarColumn
      area={height}
      pathHeight={pathHeight}
      length={value == null || value <= 0 ? null : length}
      today={today}
    />
  );
}

// 凡例（色見本＋文字）。色見本は短いマーカーの線（道筋＝うすい線、過去の日＝うすい緑、今日＝緑）
export function Legend({ items }: { items: { label: string; tone: "track" | "fill" | "today" }[] }) {
  const styles = useStyles();
  const { colors } = useTool().values;
  const swatch = { track: colors.path, fill: colors.usedPast, today: colors.used } as const; // 過去の日は棒と同じ見え方の色
  return (
    <View style={styles.legend}>
      {items.map((i) => (
        <View key={i.label} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: swatch[i.tone] }, i.tone === "track" && styles.swatchThin]} />
          <AppText variant="caption" tone="muted">
            {i.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((_c) =>
  StyleSheet.create({
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    col: { alignItems: "center", gap: tokens.space[1] },
    legend: { flexDirection: "row", flexWrap: "wrap", columnGap: tokens.space[3], rowGap: tokens.space[1] },
    legendItem: { flexDirection: "row", alignItems: "center", gap: tokens.space[1] },
    swatch: {
      width: 14,
      height: 6,
      borderTopLeftRadius: 2,
      borderBottomLeftRadius: 3,
      borderTopRightRadius: 4,
      borderBottomRightRadius: 2,
    },
    swatchThin: { height: 3 },
  }),
);

// 曜日と日付の文字（今の道具の本文の書体）
const useLabelStyles = makeToolStyles(({ fonts }) =>
  StyleSheet.create({
    day: { fontFamily: fonts.body, fontSize: tokens.font.sm, lineHeight: tokens.lineHeight.sm },
    // 日付は 12（Figma 子02 の「10/12」の幅 33 に合う大きさ。14 だと7本並べたときに隣とくっつく）
    date: { fontFamily: fonts.body, fontSize: tokens.font.xs, lineHeight: tokens.lineHeight.xs },
    strong: { fontWeight: tokens.weight.bold },
  }),
);
