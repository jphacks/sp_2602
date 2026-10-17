// 「今日の使用量」のカード（Figma 子01・子11 の UsageSummary）。棒グラフのアイコン＋見出し、大きい数字「46」＋「％ 使いました」、
// 進捗バー、右下の「詳しく見る ›」（onDetail があるときだけ。子11 にはない）。
// 割合が出せない状態（制限なし・未設定・権限なし・取得不可）は数字の代わりに UsageMessage を出す（0% と出さない）。
//   <UsageSummaryCard view={usageView(calc, blank)} onDetail={() => router.navigate("/child/usage")} onAction={…} />
import { tokens } from "@contracts/tokens";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppText, Button, Card, Icon, ProgressBar } from "@/components";
import type { UsageMessage as Message, UsageView } from "./child-view";
import { UsageMessage } from "./UsageMessage";

type Props = {
  view: UsageView;
  onDetail?: () => void;
  onAction: (kind: NonNullable<Message["action"]>["kind"]) => void;
};

export function UsageSummaryCard({ view, onDetail, onAction }: Props) {
  return (
    <Card>
      <View style={styles.heading}>
        <Icon name="insights" size={tokens.size.iconSmall} color={tokens.color.primary} />
        <AppText variant="title" accessibilityRole="header">
          今日の使用量
        </AppText>
      </View>
      {view.kind === "loading" && (
        <View style={styles.loading}>
          <ActivityIndicator color={tokens.color.primary} />
          <AppText tone="muted">読み込んでいます…</AppText>
        </View>
      )}
      {view.kind === "percent" && (
        <>
          <View style={styles.number} accessibilityLabel={`今日は ${view.percent}パーセント 使いました`}>
            <AppText variant="display" tone="primary">
              {view.percent}
            </AppText>
            <AppText>％ 使いました</AppText>
          </View>
          <ProgressBar percent={view.percent} accessibilityLabel="今日の使用量" />
        </>
      )}
      {view.kind === "message" && <UsageMessage message={view.message} onAction={onAction} />}
      {onDetail && <Button variant="soft" label="詳しく見る" trailingIcon="chevron_right" onPress={onDetail} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", gap: tokens.space[2] },
  loading: { flexDirection: "row", alignItems: "center", gap: tokens.space[3], paddingVertical: tokens.space[4] },
  number: { flexDirection: "row", alignItems: "baseline", gap: tokens.space[2] },
});
