// 期間の一覧の1画面ぶん（子10・親05・空白期間の一覧で同じものを使う）。
// 並びは Figma 子10: 「←」＋題名 → 一覧（カレンダーのアイコン・名前・日付・›）→ 下に「＋ テストを追加する」（主ボタン）。
// 並べ方は近い順（期間中・これからを開始日の早い順 → 「終わったテスト」を新しい順。logic.ts の sortPeriodsForList）。
// 状態: 読み込み中 / 取得不可（もう一度ためす。0件とは出さない）/ 古い（帯つきで前の一覧）/ 0件（「予定のテストはありません」）。
// 保護者の一覧には、子どものスマホに反映済みか（Q6）と、だれが登録したか（Q11）も出す。
// 動き: 開いたときは上から順にふわっと出す（Reveal）。反映待ち → 反映済み に変わったら札を小さく弾ませる（PopIn）。
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import { AppText, Banner, Button, Chip, PopIn, Reveal, RevealGroup, Screen, StateView } from "@/components";
import {
  appliedStatus,
  type Period,
  type PeriodKind,
  type PeriodsState,
  periodTexts,
  sortPeriodsForList,
} from "./logic";
import { PeriodRow } from "./PeriodRow";

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

  const body = () => {
    if (periods.status === "loading") return <StateView state="loading" />;
    if (periods.status === "unavailable") return <StateView state="unknown" error={periods.error} onRetry={reload} />;
    const { current, past } = sortPeriodsForList(periods.data.periods, today);
    const list =
      current.length + past.length === 0 ? (
        <Reveal index={2}>
          <StateView state="empty" message={t.emptyMessage} hint={t.emptyHint} />
        </Reveal>
      ) : (
        <View style={styles.list}>
          {current.map((p, i) => (
            <Reveal key={p.id} index={row(2 + i)} gap={tokens.layout.listGap}>
              <PeriodRow period={p} today={today} showCreator={isParent} onPress={onOpen} />
            </Reveal>
          ))}
          {past.length > 0 && (
            <Reveal index={row(2 + current.length)} gap={tokens.layout.listGap}>
              <AppText variant="label" tone="muted" accessibilityRole="header">
                {t.pastHeader}
              </AppText>
            </Reveal>
          )}
          {past.map((p, i) => (
            <Reveal key={p.id} index={row(3 + current.length + i)} gap={tokens.layout.listGap}>
              <PeriodRow period={p} today={today} showCreator={isParent} onPress={onOpen} />
            </Reveal>
          ))}
        </View>
      );
    // 反映済み／反映待ちは、サーバから取れた版でだけ出す（古い一覧の版では判断できない）。
    // 設定全体の版ではなく、この一覧が最後に変わった版で決める（計画などの保存だけで「反映待ち」にしない）
    const applied =
      isParent && periods.status === "fresh"
        ? appliedStatus(periods.data.changedVersion, periods.data.childAppliedVersion)
        : null;
    return (
      <StateView state={periods.status === "stale" ? "stale" : "success"}>
        <Reveal index={1} show={applied != null}>
          {applied && (
            <View style={styles.applied}>
              <PopIn replayKey={applied.label}>
                <Chip
                  align="start"
                  tone={applied.tone}
                  icon={applied.tone === "success" ? "check_circle" : "sync"}
                  label={applied.label}
                />
              </PopIn>
              {applied.hint ? (
                <AppText variant="caption" tone="muted">
                  {applied.hint}
                </AppText>
              ) : null}
            </View>
          )}
        </Reveal>
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
      <RevealGroup>
        {t.listBanner ? (
          <Reveal index={0}>
            <Banner icon="info" message={t.listBanner} />
          </Reveal>
        ) : null}
        {body()}
      </RevealGroup>
    </Screen>
  );
}

// 行の順番の打ち止め（たくさん並んでも待たせすぎない。これより下は同じ時に出る）
const row = (i: number) => Math.min(i, 10);

const styles = StyleSheet.create({
  list: { gap: tokens.layout.listGap },
  applied: { gap: tokens.space[1], alignItems: "flex-start" },
});
