// 進捗バー（太さ 12・角丸）。percent は 0〜100（はみ出しても 0〜100 に収める。Figma 子04 のはみ出しを起こさない）。
//   <ProgressBar percent={calc.displayUsedPercent} />
// 塗りの幅は値で決まるので、ここだけ計算した style を使う（色・寸法は tokens のまま）。
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import { makeStyles } from "@/lib/theme";

type Props = { percent: number; tone?: "primary" | "danger"; thin?: boolean; accessibilityLabel?: string };

export function ProgressBar({ percent, tone = "primary", thin = false, accessibilityLabel }: Props) {
  const styles = useStyles();
  const p = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0));
  const width = { width: `${p}%` } as const;
  return (
    <View
      style={[styles.track, thin && styles.thin]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p) }}
    >
      <View style={[styles.fill, tone === "danger" && styles.danger, width]} />
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    track: {
      height: tokens.size.progressTrack,
      borderRadius: tokens.radius.pill,
      backgroundColor: c.track,
      overflow: "hidden",
    },
    thin: { height: tokens.size.appBarTrack },
    fill: { height: "100%", borderRadius: tokens.radius.pill, backgroundColor: c.primaryFill },
    danger: { backgroundColor: c.danger },
  }),
);
