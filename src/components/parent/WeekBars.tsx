// 保護者の画面の棒グラフ（親01 今週の使用時間・親03 週ごとの平均・親02 上限の下がり方）。データは charts.ts の ChartBar。
// 共通の BarChart との違い: 1本ごとに中身の色（淡い青 / 青）・下地なし・「？」の印・下の札（「今週」「前のテスト」）を選べる。
// 棒の高さは値で決まるので、ここだけ計算した style を使う（色・寸法は tokens のまま）。
//   <WeekBars bars={homeWeekBars(days, today)} accessibilityLabel="今週の使用時間" />
// 動き（共通の BarChart の BarFill と同じ決まり。src/lib/motion.ts・src/components/chart-motion.ts）:
//   - 値が最初に分かった棒は、下から 0 → 値まで伸びる。左から順に（motion.stagger ずつ）、強調する棒（今日・今週）は一拍おく
//   - カード（Reveal）の中なら、カードが見え始めてから少し後に伸び始める（透けているうちに伸び終わらないように）
//   - 値が変わったとき（取り直し・親02 で計画を保存したあと）は、今の高さから新しい高さへ動く
//   - 値がない棒（記録なし・未来）は伸ばさない。「動きを減らす」がオンなら最後の高さをすぐ出す
import { tokens } from "@contracts/tokens";
import { useMemo, useRef } from "react";
import { Animated, type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { AppText, useRevealDelay } from "@/components";
import { barDelays, remainingDelay } from "@/components/chart-motion";
import { motion, useAnimatedNumber } from "@/lib/motion";
import { makeStyles } from "@/lib/theme";
import { type ChartBar, chartNotes } from "./charts";

// カードが見え始めてから、1本目が伸び始めるまで（ミリ秒。ホームの数え上げと同じくらい）
const GROW_LEAD = 200;

type Props = { bars: ChartBar[]; accessibilityLabel?: string };

export function WeekBars({ bars, accessibilityLabel }: Props) {
  const styles = useStyles();
  const fills = useFills();
  const tags = useTags();
  const max = Math.max(1, ...bars.flatMap((b) => [b.track ?? 0, b.value ?? 0]));
  const h = (n: number) => ({ height: Math.round((Math.min(n, max) / max) * tokens.size.chartHeight) });
  const notes = chartNotes(bars);
  const anyMissing = bars.some((b) => b.missing);
  const known = bars.some((b) => b.value != null);
  const lead = useRevealDelay(known, GROW_LEAD);
  // 動きの起点 = どれかの棒の値が最初に分かった時刻（あとから届いた棒は、予定を過ぎていれば待たせずに伸ばす）
  const origin = useRef<number | null>(null);
  if (origin.current == null && known) origin.current = Date.now();
  const delays = barDelays(
    bars.map((b) => ({ highlight: b.emphasis })),
    { stagger: motion.stagger, emphasisGap: motion.stagger },
  );
  return (
    <View style={styles.wrap}>
      <View style={styles.row} accessibilityLabel={accessibilityLabel}>
        {bars.map((b, i) => (
          <View key={b.key} style={styles.col} accessible accessibilityLabel={b.a11y}>
            <AppText variant="caption" tone={b.emphasis ? "primary" : "muted"}>
              {b.topLabel}
            </AppText>
            <View style={styles.area}>
              {b.track != null ? (
                <View style={[styles.track, h(Math.max(b.track, b.value ?? 0))]}>
                  <Fill
                    value={b.value}
                    max={max}
                    style={[styles.fill, fills[b.fill]]}
                    plannedDelay={lead + (delays[i] ?? 0)}
                    origin={origin.current}
                  />
                </View>
              ) : (
                <Fill
                  value={b.value}
                  max={max}
                  style={[styles.fill, styles.bare, fills[b.fill]]}
                  plannedDelay={lead + (delays[i] ?? 0)}
                  origin={origin.current}
                />
              )}
            </View>
            {/* 「？」は棒の下に自分の行を持つ（棒の場所の中に置くと、上限いっぱいの棒が「？」の分だけ上へはみ出し、
                上の数字（親01 の今日の「120」）に重なっていた）。どれかの棒に「？」があれば、全部の棒で同じ高さを空けてそろえる */}
            {anyMissing && (
              <AppText variant="caption" tone="muted" center>
                {b.missing ? "？" : " "}
              </AppText>
            )}
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
              // 札（「今のテスト」など）は棒の幅より広いので、1行のまま棒の左右にはみ出して出す（Figma 親03）
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

type FillProps = {
  value: number | null;
  max: number;
  style: StyleProp<ViewStyle>;
  plannedDelay: number; // 起点から、この棒が伸び始めるまで
  origin: number | null; // 起点の時刻（まだどの棒にも値がなければ null）
};

// 棒の中身。値が分かった時点で、予定の残りだけ待ってから伸びる（BarChart の BarFill と同じ作り）
function Fill({ value, max, style, plannedDelay, origin }: FillProps) {
  // 待ち時間は値が最初に分かったときに一度だけ決める（あとで変えると、動きがやり直しになる）
  const wait = useRef<number | null>(null);
  if (value != null && wait.current == null) {
    wait.current = remainingDelay(plannedDelay, origin == null ? 0 : Date.now() - origin);
  }
  const { value: level } = useAnimatedNumber(value, { duration: motion.duration.medium, delay: wait.current ?? 0 });
  const grow = useMemo(
    () => ({
      height: level.interpolate({
        inputRange: [0, max],
        outputRange: [0, tokens.size.chartHeight],
        extrapolate: "clamp",
      }),
    }),
    [level, max],
  );
  if (value == null) return null;
  return <Animated.View style={[style, grow]} />;
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    wrap: { gap: tokens.space[2] },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    col: { flex: 1, alignItems: "center", gap: tokens.space[1] },
    area: { height: tokens.size.chartHeight, justifyContent: "flex-end", alignItems: "center" },
    track: {
      width: tokens.size.chartBarWidth,
      backgroundColor: c.track,
      borderRadius: tokens.radius.sm,
      justifyContent: "flex-end",
      overflow: "hidden",
    },
    fill: { width: "100%", borderRadius: tokens.radius.sm },
    bare: { width: tokens.size.chartBarWidth },
    tagRow: { width: tokens.size.chartTagWidth, alignItems: "center" },
    tag: { paddingHorizontal: tokens.space[1], borderRadius: tokens.radius.sm },
  }),
);

const useFills = makeStyles((c) =>
  StyleSheet.create({
    muted: { backgroundColor: c.primaryMuted },
    strong: { backgroundColor: c.primaryFill },
  }),
);

const useTags = makeStyles((c) =>
  StyleSheet.create({
    strong: { backgroundColor: c.primaryFill },
    soft: { backgroundColor: c.primarySoft },
  }),
);
