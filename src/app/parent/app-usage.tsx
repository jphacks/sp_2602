// 親09 アプリごとの利用時間（Figma 108:7663）。下部タブは出たまま（Figma では「振り返り」が選択中）。
// データ: call("usageGet", { 今日〜今日 }) の UsageDay（usedMinutes = 制限の対象の合計、apps = アプリ別の分数）。30 秒ごとに取り直す。
// 行き先: 「←」→ 来た画面（親01 の「詳しく見る」・親03 の「各アプリごとの利用時間を見る」）。
// 記録がない日は「まだ記録が届いていません」（0 分と区別する。C6）。対象外のアプリは合計に入らないので、別の見出しで分けて出す。
// アイコン: 子どもの端末から届いた本物のアイコン（useAppIcons。Q15・D-110）。届いていないアプリは頭文字の仮のアイコン。
import { todayString } from "@contracts/dates";
import { tokens } from "@contracts/tokens";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AppText, Banner, Card, ProgressBar, Screen, StateView } from "@/components";
import { ChildGate, useUsage } from "@/components/parent/data";
import { mdw, timeJst } from "@/components/parent/format";
import { AppIcon } from "@/components/parent/parts";
import { type AppRow, appUsageRows, limitText, todaySummary } from "@/components/parent/today";
import { useAppIcons } from "@/lib/app-icons";
import { makeStyles } from "@/lib/theme";

export default function ParentAppUsage() {
  return (
    <Screen title="アプリごとの利用時間" onBack={() => router.back()} bottomInset={false}>
      <ChildGate>{(child) => <AppUsageBody childId={child.id} />}</ChildGate>
    </Screen>
  );
}

function AppUsageBody({ childId }: { childId: string }) {
  const today = todayString();
  const { state, reload } = useUsage(childId, today, today);
  if (state.status === "loading") return <StateView state="loading" />;
  if (state.status === "error") return <StateView state="unknown" error={state.error} onRetry={() => void reload()} />;
  const day = state.view.days.find((d) => d.date === today);
  const summary = todaySummary(day);
  if (summary.kind === "missing")
    return <StateView state="unknown" message="今日の記録を取得できませんでした" onRetry={() => void reload()} />;
  const rows = appUsageRows(day?.apps ?? []);
  return (
    <AppUsageList childId={childId} today={today} rows={rows} summary={summary} stale={state.status === "stale"} />
  );
}

// アイコンの hook は早く返す分かれ道の後ろで呼べないので、一覧の部分を分ける
function AppUsageList({
  childId,
  today,
  rows,
  summary,
  stale,
}: {
  childId: string;
  today: string;
  rows: ReturnType<typeof appUsageRows>;
  summary: Exclude<ReturnType<typeof todaySummary>, { kind: "missing" }>;
  stale: boolean;
}) {
  const styles = useStyles();
  const icons = useAppIcons(
    childId,
    [...rows.restricted, ...rows.excluded].map((r) => r.packageName),
  );
  const measuredAt = summary.kind === "recorded" && summary.measuredAt ? timeJst(summary.measuredAt) : null;
  return (
    <>
      {stale && (
        <Banner
          tone="warning"
          icon="cloud_off"
          message="最新でない可能性があります"
          hint="通信できるようになると自動で更新します"
        />
      )}
      <Card tone="soft">
        <AppText variant="label" tone="onPrimarySoft">
          今日 {mdw(today)}の合計
        </AppText>
        {summary.kind === "recorded" ? (
          <View style={styles.amount}>
            <AppText variant="display" tone="onPrimarySoft">
              {summary.usedMinutes}
            </AppText>
            <AppText tone="onPrimarySoft">分 ／ {limitText(summary.limit)}</AppText>
          </View>
        ) : (
          <AppText variant="title" tone="onPrimarySoft">
            まだ記録が届いていません（{limitText(summary.limit)}）
          </AppText>
        )}
        {measuredAt ? (
          <AppText variant="caption" tone="onPrimarySoft">
            {measuredAt} 時点の記録
          </AppText>
        ) : null}
      </Card>
      {summary.kind === "no_record" ? (
        <StateView
          state="empty"
          message="まだ記録が届いていません"
          hint="子どものスマホがつながると、アプリごとの時間が届きます"
        />
      ) : (
        <>
          <AppText variant="label">使ったアプリ（多い順）</AppText>
          {rows.restricted.length === 0 ? (
            <AppText tone="muted">今日は、制限の対象のアプリを使っていません（0 分）</AppText>
          ) : (
            rows.restricted.map((r) => <AppUsageRow key={r.packageName} row={r} icon={icons.get(r.packageName)} />)
          )}
          {rows.excluded.length > 0 && (
            <>
              <AppText variant="label">制限の対象外のアプリ（合計に入りません）</AppText>
              {rows.excluded.map((r) => (
                <AppUsageRow key={r.packageName} row={r} icon={icons.get(r.packageName)} />
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}

function AppUsageRow({ row, icon }: { row: AppRow; icon: string | undefined }) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessible accessibilityLabel={`${row.label} ${row.minutes}分`}>
      <AppIcon initial={row.initial} uri={icon} />
      <View style={styles.middle}>
        <AppText variant="body">{row.label}</AppText>
        <ProgressBar percent={row.barPercent} thin />
      </View>
      <AppText variant="title">{row.minutes}分</AppText>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    amount: { flexDirection: "row", alignItems: "baseline", gap: tokens.space[2], flexWrap: "wrap" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space[3],
      padding: tokens.space[4],
      backgroundColor: c.surface,
      borderRadius: tokens.radius.card,
      borderWidth: tokens.size.border,
      borderColor: c.line,
    },
    middle: { flex: 1, gap: tokens.space[2] },
  }),
);
