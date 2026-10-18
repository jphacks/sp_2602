// tmp/animations/rnweb/whiteboard/components/schedule/PeriodListScreen.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 期間の一覧の1画面ぶん（子10・親05・空白期間の一覧で同じものを使う）。props・状態・並べ方はアプリの PeriodListScreen と同じ。
// 並びは Figma 子10: 「←」＋題名 → 一覧（カレンダーのアイコン・名前・日付・›）→ 下に「＋ テストを追加する」（主ボタン）。
// 並べ方は近い順（期間中・これからを開始日の早い順 → 「終わったテスト」を新しい順。logic.ts の sortPeriodsForList）。
// 状態: 読み込み中 / 取得不可（もう一度ためす。0件とは出さない）/ 古い（帯つきで前の一覧）/ 0件（「予定のテストはありません」）。
// 保護者の一覧には、お子さんの端末に反映済みか（Q6）と、だれが登録したか（Q11）も出す。
// 見た目（Figma 子10・子10-C）:
//   - 行の間は 16。「終わったテスト」は見出しの書体 14（ink）で、上を少し空けて区切る
//   - 一覧の一番上の期間中・これからのテスト（次のテスト）の日付だけに印（PeriodRow に MarkedPeriod で伝える。テスト期間だけ。
//     空白期間はテストではないので印を付けない）
//   - 画面を開いたときは、行が上から順にふわっと出る（Reveal）
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import { AppText, Banner, Button, Chip, Reveal, RevealGroup, Screen, StateView } from "@/kids/components";
import { Text } from "@/kids/lib/text";
import { makeToolStyles } from "../../tools";
import {
  appliedStatus,
  type Period,
  type PeriodKind,
  type PeriodsState,
  periodTexts,
  sortPeriodsForList,
} from "./logic";
import { MarkedPeriod, PeriodRow } from "./PeriodRow";

type Props = {
  kind: PeriodKind;
  viewer: "parent" | "child";
  today: string;
  periods: PeriodsState;
  reload: () => void;
  onBack?: () => void;
  onAdd: () => void;
  onOpen: (p: Period) => void;
};

export function PeriodListScreen({ kind, viewer, today, periods, reload, onBack, onAdd, onOpen }: Props) {
  const t = periodTexts(kind, viewer);
  const isParent = viewer === "parent";
  const text = useTextStyles();

  const body = () => {
    if (periods.status === "loading") return <StateView state="loading" />;
    if (periods.status === "unavailable") return <StateView state="unknown" error={periods.error} onRetry={reload} />;
    const { current, past } = sortPeriodsForList(periods.data.periods, today);
    const marked = kind === "test" ? (current[0]?.id ?? null) : null;
    const list =
      current.length + past.length === 0 ? (
        <StateView state="empty" message={t.emptyMessage} hint={t.emptyHint} />
      ) : (
        <MarkedPeriod.Provider value={marked}>
          <RevealGroup>
            <View style={styles.list}>
              {current.map((p, i) => (
                <Reveal key={p.id} index={i}>
                  <PeriodRow period={p} today={today} showCreator={isParent} onPress={onOpen} />
                </Reveal>
              ))}
              {past.length > 0 && (
                <Reveal index={current.length}>
                  <Text style={text.pastHeader} accessibilityRole="header">
                    {t.pastHeader}
                  </Text>
                </Reveal>
              )}
              {past.map((p, i) => (
                <Reveal key={p.id} index={current.length + 1 + i}>
                  <PeriodRow period={p} today={today} showCreator={isParent} onPress={onOpen} />
                </Reveal>
              ))}
            </View>
          </RevealGroup>
        </MarkedPeriod.Provider>
      );
    // 反映済み／反映待ちは、サーバから取れた版でだけ出す（古い一覧の版では判断できない）。
    // 設定全体の版ではなく、この一覧が最後に変わった版で決める（計画などの保存だけで「反映待ち」にしない）
    const applied =
      isParent && periods.status === "fresh"
        ? appliedStatus(periods.data.changedVersion, periods.data.childAppliedVersion)
        : null;
    return (
      <StateView state={periods.status === "stale" ? "stale" : "success"}>
        {applied && (
          <View style={styles.applied}>
            <Chip
              align="start"
              tone={applied.tone}
              icon={applied.tone === "success" ? "check_circle" : "sync"}
              label={applied.label}
            />
            <AppText variant="caption" tone="muted">
              {applied.hint}
            </AppText>
          </View>
        )}
        {list}
      </StateView>
    );
  };

  return (
    <Screen
      title={t.listTitle}
      onBack={onBack}
      bottomInset={false}
      footer={<Button label={t.addLabel} icon="add" onPress={onAdd} />}
    >
      {t.listBanner ? <Banner icon="info" message={t.listBanner} /> : null}
      {body()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Figma 子10-C: 行の間は 16
  list: { gap: tokens.layout.cardGap },
  applied: { gap: tokens.space[1], alignItems: "flex-start" },
});

// 「終わったテスト」（Figma 子10-C: 見出しの書体 14・ink・枠の左から 4。前の行との間を少し広く空けて区切る）
const useTextStyles = makeToolStyles(({ fonts, colors }) =>
  StyleSheet.create({
    pastHeader: {
      fontFamily: fonts.heading,
      fontWeight: "400",
      fontSize: tokens.font.sm,
      lineHeight: tokens.lineHeight.sm,
      color: colors.ink,
      paddingTop: tokens.space[3],
      paddingLeft: tokens.space[1],
    },
  }),
);
