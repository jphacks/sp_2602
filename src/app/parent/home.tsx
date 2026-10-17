// 親01 ホーム（Figma 108:7290）。子どもの今日の使用時間（分）・今週の使用時間のグラフ・次のテストを出す。
// データ: 今日と今週の実績と日別上限は call("usageGet", 月曜〜日曜)（C6。30 秒ごとに取り直す）、
//         次のテスト・通常上限・空白期間は useParentData().config（C7 の設定の組）。親の端末の使用時間は使わない（MVP_SPEC 5.2）。
// 行き先: 「詳しく見る ›」→ /parent/app-usage（親09）、通常上限が未設定なら「1日の上限を決める」→ /pair/usual-limit（Q7）。
// 記録なし・0 分・取得不可を区別する（C6）。取れなかった値を 0 分と出さない。空白期間の日は「制限なし」（Q7）。
import { addDays, formatDateJa, mondayOf, todayString } from "@contracts/dates";
import type { ConfigSnapshot } from "@contracts/schemas";
import { tokens } from "@contracts/tokens";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AppText, Banner, Button, Card, Icon, Legend, ProgressBar, Screen, StateView } from "@/components";
import { homeWeekBars } from "@/components/parent/charts";
import { ChildGate, type UsageState, useUsage } from "@/components/parent/data";
import { timeJst } from "@/components/parent/format";
import { limitText, todaySummary } from "@/components/parent/today";
import { WeekBars } from "@/components/parent/WeekBars";
import type { ConfigState } from "@/lib/config-cache";
import { useParentData } from "@/lib/parent-data";
import { useColors } from "@/lib/theme";
import { currentBlankPeriod, nextTest } from "@/lib/usage-calc";

export default function ParentHome() {
  return (
    <Screen title="Slope（親）" bottomInset={false}>
      <ChildGate>{(child) => <HomeBody childId={child.id} />}</ChildGate>
    </Screen>
  );
}

function HomeBody({ childId }: { childId: string }) {
  const today = todayString();
  const monday = mondayOf(today);
  const { state, reload } = useUsage(childId, monday, addDays(monday, 6));
  const { config } = useParentData();
  const snapshot = config && config.status !== "unavailable" ? config.snapshot : null;
  const stale = state.status === "stale" || config?.status === "stale";
  return (
    <>
      {snapshot && snapshot.usualLimitMinutes == null && (
        // Q7: 通常上限がまだない = 計画やテストがない日は「上限未設定」になる。決める画面へ案内する
        <Banner
          icon="info"
          message="1日の上限がまだ決まっていません"
          hint="テストや計画がない日の上限です。決めるまで、その日は「上限未設定」になります。"
          action={<Button variant="soft" label="1日の上限を決める" onPress={() => router.push("/pair/usual-limit")} />}
        />
      )}
      {stale && (
        <Banner
          tone="warning"
          icon="cloud_off"
          message="最新でない可能性があります"
          hint="通信できるようになると自動で更新します"
        />
      )}
      <TodayCard state={state} today={today} snapshot={snapshot} onRetry={() => void reload()} />
      <WeekCard state={state} today={today} onRetry={() => void reload()} />
      <NextTestCard config={config} snapshot={snapshot} today={today} />
    </>
  );
}

// 「今日の使用量」: 120 分 ／ 上限 260分・進捗バー・詳しく見る
function TodayCard(props: { state: UsageState; today: string; snapshot: ConfigSnapshot | null; onRetry: () => void }) {
  const c = useColors();
  const { state, today, snapshot, onRetry } = props;
  const header = (
    <View style={styles.header}>
      <Icon name="insights" color={c.primary} />
      <AppText variant="title">今日の使用量</AppText>
    </View>
  );
  if (state.status === "loading" || state.status === "error")
    return (
      <Card>
        {header}
        <StateView
          state={state.status === "loading" ? "loading" : "unknown"}
          error={state.status === "error" ? state.error : null}
          onRetry={onRetry}
        />
      </Card>
    );
  const summary = todaySummary(state.view.days.find((d) => d.date === today));
  const blank = currentBlankPeriod(snapshot, today);
  const detail = (
    <Button
      variant="soft"
      label="詳しく見る"
      trailingIcon="chevron_right"
      onPress={() => router.push("/parent/app-usage")}
    />
  );
  if (summary.kind === "missing")
    return (
      <Card>
        {header}
        <StateView state="unknown" message="今日の記録を取得できませんでした" onRetry={onRetry} />
      </Card>
    );
  const limitLine =
    summary.limit.kind === "unlimited" && blank ? `制限なし（${blank.name}）` : limitText(summary.limit);
  const measuredAt = summary.kind === "recorded" && summary.measuredAt ? timeJst(summary.measuredAt) : null;
  return (
    <Card>
      {header}
      {summary.kind === "no_record" ? (
        // 記録が届いていない（0 分ではない）
        <View style={styles.gapSmall}>
          <AppText variant="title">まだ記録が届いていません</AppText>
          <AppText tone="muted">子どものスマホがつながると、使った時間が届きます。（{limitLine}）</AppText>
        </View>
      ) : (
        <View style={styles.gapSmall}>
          <View style={styles.amount}>
            <AppText variant="display" tone="primary">
              {summary.usedMinutes}
            </AppText>
            <AppText variant="body">分 ／ {limitLine}</AppText>
          </View>
          {summary.percent != null && (
            <ProgressBar
              percent={summary.percent}
              accessibilityLabel={`今日の使用量 ${summary.usedMinutes}分、${limitLine}`}
            />
          )}
          {measuredAt ? (
            <AppText variant="caption" tone="muted">
              {measuredAt} 時点の記録
            </AppText>
          ) : null}
        </View>
      )}
      {detail}
    </Card>
  );
}

// 「今週の使用時間（分）」: 月〜日の棒（下地 = 上限、中身 = 使った時間）
function WeekCard({ state, today, onRetry }: { state: UsageState; today: string; onRetry: () => void }) {
  return (
    <Card>
      <View style={styles.titleRow}>
        <AppText variant="label" strong>
          今週の使用時間（分）
        </AppText>
        <Legend
          items={[
            { label: "上限", tone: "track" },
            { label: "使った時間", tone: "today" },
          ]}
        />
      </View>
      {state.status === "loading" || state.status === "error" ? (
        <StateView
          state={state.status === "loading" ? "loading" : "unknown"}
          error={state.status === "error" ? state.error : null}
          onRetry={onRetry}
        />
      ) : (
        <WeekBars bars={homeWeekBars(state.view.days, today)} accessibilityLabel="今週の使用時間（分）" />
      )}
    </Card>
  );
}

// 「次のテスト」: 10月28日（水） 数学・あと13日
function NextTestCard(props: { config: ConfigState | null; snapshot: ConfigSnapshot | null; today: string }) {
  const c = useColors();
  const { config, snapshot, today } = props;
  const next = nextTest(snapshot, today);
  let main: string;
  let sub: string | null = null;
  if (!config) main = "読み込んでいます…";
  else if (!snapshot) main = "テストの予定を読み込めません";
  else if (!next) main = "予定されているテストはありません";
  else {
    main = `${formatDateJa(next.startDate)} ${next.name}`;
    sub = next.ongoing ? "テスト期間中" : `あと${next.daysUntil}日`;
  }
  return (
    <Card tone="soft">
      <View style={styles.nextRow}>
        <Icon name="event" color={c.onPrimarySoft} size={tokens.size.iconLarge} />
        <View style={styles.flex}>
          <AppText variant="label" tone="onPrimarySoft">
            次のテスト
          </AppText>
          <AppText variant="title" tone="onPrimarySoft">
            {main}
          </AppText>
          {sub ? (
            <AppText variant="body" tone="onPrimarySoft">
              {sub}
            </AppText>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: tokens.space[2] },
  gapSmall: { gap: tokens.space[2] },
  amount: { flexDirection: "row", alignItems: "baseline", gap: tokens.space[2], flexWrap: "wrap" },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: tokens.space[2],
  },
  nextRow: { flexDirection: "row", alignItems: "center", gap: tokens.space[4] },
});
