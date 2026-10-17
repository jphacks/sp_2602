// 親03 振り返り（Figma 108:7413）。計画を始めてから上限がどれだけ下がったか（成果）と、週ごとの1日の使用時間を出す。
// データ: 上限の減り・期間・テストのお知らせは useParentData().config（C7。サーバの日別上限 = C10 の結果をそのまま使う）、
//         週ごとの平均は call("usageGet", 6週ぶん)（C6。30 秒ごとに取り直す）。
// 行き先: 「各アプリごとの利用時間を見る ›」→ /parent/app-usage（親09）、計画がなければ「計画を作る」→ /parent/plan（親02）。
// 「減った」の基準は未決（Q19）。仮の基準は src/components/parent/review.ts の limitReduction（TODO(未決)）。
import { todayString } from "@contracts/dates";
import type { ConfigSnapshot } from "@contracts/schemas";
import { tokens } from "@contracts/tokens";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { AppText, Banner, Button, Card, configViewState, Screen, StateView } from "@/components";
import { reviewRange, reviewWeekBars } from "@/components/parent/charts";
import { ChildGate, type UsageState, useUsage } from "@/components/parent/data";
import { md } from "@/components/parent/format";
import { Badge, LinkCard, Note, Strip } from "@/components/parent/parts";
import { afterTestNote, limitReduction, previousTest, reviewPeriod } from "@/components/parent/review";
import { BarLegend, WeekBars } from "@/components/parent/WeekBars";
import { useParentData } from "@/lib/parent-data";
import { nextTest } from "@/lib/usage-calc";

export default function ParentReview() {
  return (
    <Screen title="振り返り" bottomInset={false}>
      <ChildGate>{(child) => <ReviewBody childId={child.id} />}</ChildGate>
    </Screen>
  );
}

function ReviewBody({ childId }: { childId: string }) {
  const today = todayString();
  const range = reviewRange(today);
  const { state, reload } = useUsage(childId, range.from, range.to);
  const { config, refresh } = useParentData();
  const view = configViewState(config);
  // 設定の組がないと、期間・減り・テストが出せない（0 分とも出さない）
  if (view === "loading" || view === "unknown" || !config || config.status === "unavailable")
    return (
      <StateView
        state={view === "loading" ? "loading" : "unknown"}
        error={config?.status === "unavailable" ? config.error : null}
        onRetry={() => void refresh()}
      />
    );
  const snapshot = config.snapshot;
  const note = afterTestNote(snapshot, today);
  return (
    <>
      {(view === "stale" || state.status === "stale") && (
        <Banner
          tone="warning"
          icon="cloud_off"
          message="最新でない可能性があります"
          hint="通信できるようになると自動で更新します"
        />
      )}
      <Strip>{reviewPeriod(snapshot, today)}</Strip>
      <ReductionCard snapshot={snapshot} today={today} />
      <WeeklyCard state={state} snapshot={snapshot} today={today} onRetry={() => void reload()} />
      {note ? <Note>{note}</Note> : null}
      <LinkCard label="各アプリごとの利用時間を見る" icon="apps" onPress={() => router.push("/parent/app-usage")} />
    </>
  );
}

// 「初日（10/12）から今日（10/15）までに 40 分 減りました」「上限が 13% 減」
function ReductionCard({ snapshot, today }: { snapshot: ConfigSnapshot; today: string }) {
  const r = limitReduction(snapshot, today);
  if (r.kind === "no_plan")
    return (
      <Card tone="soft">
        <AppText variant="title" tone="onPrimarySoft">
          まだ計画がありません
        </AppText>
        <AppText tone="onPrimarySoft">計画を作ると、テストに向けて上限が少しずつ下がっていく様子が見られます。</AppText>
        <Button
          variant="soft"
          label="計画を作る"
          trailingIcon="chevron_right"
          onPress={() => router.push("/parent/plan")}
        />
      </Card>
    );
  if (r.kind !== "ok") {
    const text =
      r.kind === "not_started"
        ? `計画は ${md(r.startDate)} から始まります`
        : r.kind === "unlimited_today"
          ? "今日は制限なし（空白期間）のため、上限を比べられません"
          : "今日の上限を読み込めないため、比べられません";
    return (
      <Card tone="soft">
        <AppText variant="title" tone="onPrimarySoft">
          {text}
        </AppText>
      </Card>
    );
  }
  const lead = `初日（${md(r.startDate)}）から今日（${md(today)}）までに`;
  if (r.startDate === today)
    return (
      <Card tone="soft">
        <AppText variant="title" tone="onPrimarySoft">
          今日が計画の初日です
        </AppText>
        <AppText tone="onPrimarySoft">今日の上限は {r.todayLimit}分 です。明日から少しずつ下がっていきます。</AppText>
      </Card>
    );
  const up = r.reducedMinutes < 0;
  return (
    <Card tone="soft">
      <AppText variant="label" tone="onPrimarySoft">
        {lead}
      </AppText>
      <View
        style={styles.amount}
        accessible
        accessibilityLabel={`${lead}、上限が${Math.abs(r.reducedMinutes)}分${up ? "増えました" : "減りました"}`}
      >
        <AppText variant="display" tone="onPrimarySoft">
          {Math.abs(r.reducedMinutes)}
        </AppText>
        <AppText variant="title" tone="onPrimarySoft">
          {up ? "分 増えました" : "分 減りました"}
        </AppText>
      </View>
      <AppText variant="caption" tone="onPrimarySoft">
        上限 {r.startLimit}分 → {r.todayLimit}分
      </AppText>
      {r.percent != null && !up ? <Badge label={`上限が ${r.percent}% 減`} /> : null}
    </Card>
  );
}

// 「週ごとの1日の使用時間（平均・分）」
function WeeklyCard(props: { state: UsageState; snapshot: ConfigSnapshot; today: string; onRetry: () => void }) {
  const { state, snapshot, today, onRetry } = props;
  const prev = previousTest(snapshot.testPeriods, today);
  const next = nextTest(snapshot, today);
  return (
    <Card>
      <AppText variant="title">週ごとの1日の使用時間（平均・分）</AppText>
      <BarLegend
        items={[
          { label: "上限", tone: "track" },
          { label: "使った時間", tone: "strong" },
          { label: "使った時間（計画の前）", tone: "muted" },
        ]}
      />
      {state.status === "loading" || state.status === "error" ? (
        <StateView
          state={state.status === "loading" ? "loading" : "unknown"}
          error={state.status === "error" ? state.error : null}
          onRetry={onRetry}
        />
      ) : (
        <WeekBars
          bars={reviewWeekBars(state.view.days, today, {
            planStartDate: snapshot.plan?.planStartDate ?? null,
            prevTestStart: prev?.startDate ?? null,
            nextTestStart: next?.startDate ?? null,
          })}
          accessibilityLabel="週ごとの1日の使用時間（平均・分）"
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  amount: { flexDirection: "row", alignItems: "baseline", gap: tokens.space[2], flexWrap: "wrap" },
});
