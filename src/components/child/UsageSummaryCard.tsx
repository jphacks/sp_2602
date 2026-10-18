// 「今日の使用量」のカード（Figma 子01・子11 の UsageSummary）。棒グラフのアイコン＋見出し、大きい数字「46」＋「％ 使いました」、
// 進捗バー、右下の「詳しく見る ›」（onDetail があるときだけ。子11 にはない）。
// 割合が出せない状態（制限なし・未設定・権限なし・取得不可）は数字の代わりに UsageMessage を出す（0% と出さない）。
//   <UsageSummaryCard view={usageView(calc, blank)} onDetail={() => router.navigate("/child/usage")} onAction={…} />
// 動き（src/lib/motion.ts の決まり）:
//   - 割合が最初に分かったとき、数字が 0 から数え上がり、進捗バーも同じ値（同じ Animated.Value）で 0 から伸びる（ずれない）
//   - 30 秒ごとの取り直しで値が変わったら、今の位置から新しい値へ動く。案内の文をはさんで割合に戻ったときも、前の値から動く
//   - 割合が出せない間は数字もバーも出さない（0 から数えない。MVP_SPEC 5.3・AC-09）
//   - カードが Reveal の中にあれば、カードが見えてから伸ばす（透けているうちに伸び終わらないように）
//   - 読み込み中 → 割合・案内に変わるときは、短く透明から出す
import { tokens } from "@contracts/tokens";
import type { ComponentProps } from "react";
import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AppText, Button, Card, FadeIn, Icon, ProgressBar, useRevealDelay } from "@/components";
import { UsageSummaryCard as KidsUsageSummaryCard } from "@/kids/components/child/UsageSummaryCard";
import { useKidsUI } from "@/kids/KidsUI";
import { motion, useAnimatedNumber } from "@/lib/motion";
import { makeStyles, useColors } from "@/lib/theme";
import type { UsageMessage as Message, UsageView } from "./child-view";
import { UsageMessage } from "./UsageMessage";

// カードが見え始めてから、バーが伸び始めるまで（カードがほぼ見えてから動かす）
const FILL_LEAD = motion.duration.short;

type Props = {
  view: UsageView;
  onDetail?: () => void;
  onAction: (kind: NonNullable<Message["action"]>["kind"]) => void;
};

function ClassicUsageSummaryCard({ view, onDetail, onAction }: Props) {
  const c = useColors();
  const styles = useStyles();
  const target = view.kind === "percent" ? view.percent : null;
  const delay = useRevealDelay(target != null, FILL_LEAD);
  const { value, display, reduced } = useAnimatedNumber(target, { duration: motion.duration.fill, delay });
  // 前に出していた数字（案内の文から割合に戻った最初の1コマで「0」を出さないため）
  const lastShown = useRef<number | null>(null);
  useEffect(() => {
    if (display != null) lastShown.current = display;
  }, [display]);
  // 動き始める前（待っている間）は 0 から。「動きを減らす」がオンなら最初から値を出す
  const shown = display ?? (reduced ? target : lastShown.current) ?? 0;

  return (
    <Card>
      <View style={styles.heading}>
        <Icon name="insights" size={tokens.size.iconSmall} color={c.primary} />
        <AppText variant="title" accessibilityRole="header">
          今日の使用量
        </AppText>
      </View>
      {view.kind === "loading" && (
        <View style={styles.loading}>
          <ActivityIndicator color={c.primary} />
          <AppText tone="muted">読み込んでいます…</AppText>
        </View>
      )}
      {view.kind === "percent" && (
        <FadeIn key="percent" style={styles.block}>
          {/* 1つのまとまりとして読み上げる（数え上げの途中の数字ではなく、ラベルの最後の値を読む） */}
          <View style={styles.number} accessible accessibilityLabel={`今日は ${view.percent}パーセント 使いました`}>
            <Text style={styles.percent}>{shown}</Text>
            <AppText>％ 使いました</AppText>
          </View>
          <ProgressBar percent={view.percent} progress={value} accessibilityLabel="今日の使用量" />
        </FadeIn>
      )}
      {view.kind === "message" && (
        <FadeIn key={view.reason}>
          <UsageMessage message={view.message} onAction={onAction} />
        </FadeIn>
      )}
      {onDetail && <Button variant="soft" label="詳しく見る" trailingIcon="chevron_right" onPress={onDetail} />}
    </Card>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    heading: { flexDirection: "row", alignItems: "center", gap: tokens.space[2] },
    // 読み込み中も、割合が出たとき（数字＋間隔＋バー）と同じ高さにしておく。出たときに下のカードがガタッと動かないように
    loading: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space[3],
      minHeight: tokens.lineHeight.display + tokens.space[3] + tokens.size.progressTrack,
    },
    // 数字とバーの間（もとはカードの並びの間隔 space[3]。ひとまとまりにして透明から出すので、ここで同じ間隔をとる）
    block: { gap: tokens.space[3] },
    number: { flexDirection: "row", alignItems: "baseline", gap: tokens.space[2] },
    // AppText の display と同じ見た目。数え上げの間に数字の幅が変わって「％ 使いました」が左右に揺れないよう、数字の幅をそろえる
    percent: {
      fontSize: tokens.font.display,
      lineHeight: tokens.lineHeight.display,
      fontWeight: tokens.weight.bold,
      color: c.primary,
      fontVariant: ["tabular-nums"],
    },
  }),
);

// ── 子ども用の見た目への振り分け（決まりは ../kids-switch.tsx。この部品は画面がファイルを直接読むので、ここで振り分ける） ──

export function UsageSummaryCard(p: ComponentProps<typeof ClassicUsageSummaryCard>) {
  return useKidsUI() ? <KidsUsageSummaryCard {...p} /> : <ClassicUsageSummaryCard {...p} />;
}
