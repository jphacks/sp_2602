// 親09 アプリごとの利用時間（Figma 108:7663）。下部タブは出たまま（Figma では「振り返り」が選択中）。
// データ: call("usageGet", { 今日〜今日 }) の UsageDay（usedMinutes = 制限の対象の合計、apps = アプリ別の分数）。30 秒ごとに取り直す。
// 行き先: 「←」→ 来た画面（親01 の「詳しく見る」・親03 の「アプリごとの利用時間を見る」）。
// 記録がない日は「まだ記録が届いていません」（0 分と区別する。C6）。対象外のアプリは合計に入らないので、別の見出しで分けて出す。
// アイコン: 子どもの端末から届いた本物のアイコン（useAppIcons。Q15・D-110）。届いていないアプリは頭文字の仮のアイコン。
import { todayString } from "@contracts/dates";
import { tokens } from "@contracts/tokens";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import {
  AppText,
  Banner,
  Card,
  ProgressBar,
  Reveal,
  RevealGroup,
  Screen,
  StateView,
  useRevealDelay,
} from "@/components";
import { ChildGate, useUsage } from "@/components/parent/data";
import { mdw, timeJst } from "@/components/parent/format";
import { AppIcon } from "@/components/parent/parts";
import { type AppRow, appUsageRows, limitText, todaySummary } from "@/components/parent/today";
import { useAppIcons } from "@/lib/app-icons";
import { motion, useAnimatedNumber } from "@/lib/motion";
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
  const icons = useAppIcons(
    childId,
    [...rows.restricted, ...rows.excluded].map((r) => r.packageName),
  );
  const measuredAt = summary.kind === "recorded" && summary.measuredAt ? timeJst(summary.measuredAt) : null;
  // 行は上から順に出す（合計のカードの次から）。たくさんあっても待たせすぎないよう、順番は途中で打ち止めにする
  let order = 2;
  const next = () => Math.min(order++, ROW_ORDER_MAX);
  return (
    // ホームと同じく、開いたときは上から順にふわっと出す。後から出る帯は高さを広げて入れる
    <RevealGroup>
      <Reveal index={0} show={stale}>
        <Banner
          tone="warning"
          icon="cloud_off"
          message="最新でない可能性があります"
          hint="通信できるようになると自動で更新します"
        />
      </Reveal>
      <Reveal index={1}>
        <TotalCard
          minutes={summary.kind === "recorded" ? summary.usedMinutes : null}
          limit={limitText(summary.limit)}
          today={today}
          measuredAt={measuredAt}
        />
      </Reveal>
      {summary.kind === "no_record" ? (
        <Reveal index={next()}>
          <StateView
            state="empty"
            message="まだ記録が届いていません"
            hint="子どものスマホがつながると、アプリごとの時間が届きます"
          />
        </Reveal>
      ) : (
        <>
          <Reveal index={next()}>
            <AppText variant="label">使ったアプリ（多い順）</AppText>
          </Reveal>
          {rows.restricted.length === 0 ? (
            <Reveal index={next()}>
              <AppText tone="muted">今日は、制限の対象のアプリを使っていません（0 分）</AppText>
            </Reveal>
          ) : (
            rows.restricted.map((r) => (
              <Reveal key={r.packageName} index={next()}>
                <AppUsageRow row={r} icon={icons.get(r.packageName)} />
              </Reveal>
            ))
          )}
          {rows.excluded.length > 0 && (
            <>
              <Reveal index={next()}>
                <AppText variant="label">制限の対象外のアプリ（合計に入りません）</AppText>
              </Reveal>
              {rows.excluded.map((r) => (
                <Reveal key={r.packageName} index={next()}>
                  <AppUsageRow row={r} icon={icons.get(r.packageName)} />
                </Reveal>
              ))}
            </>
          )}
        </>
      )}
    </RevealGroup>
  );
}

// 行の順番の打ち止め（これより下の行は同じ時に出る）
const ROW_ORDER_MAX = 8;
// カードが見え始めてから数え上げを始めるまで（ミリ秒。ホームと同じ）
const COUNT_LEAD = 200;

// 「今日 10/15（木）の合計」: 120 分 ／ 上限 260分。数字はカードが見えてから 0 から数え上げる（記録がないときは動かさない）
function TotalCard(props: { minutes: number | null; limit: string; today: string; measuredAt: string | null }) {
  const styles = useStyles();
  const { minutes, limit, today, measuredAt } = props;
  const delay = useRevealDelay(minutes != null, COUNT_LEAD);
  const { display, reduced } = useAnimatedNumber(minutes, { duration: motion.duration.fill, delay });
  // 数え上げが始まるまでは 0（最後の値が一瞬見えてから 0 に戻る、を出さない）
  const shown = display ?? (reduced ? minutes : 0);
  return (
    <Card tone="soft">
      <AppText variant="label" tone="onPrimarySoft">
        今日 {mdw(today)}の合計
      </AppText>
      {minutes != null ? (
        <View style={styles.amount}>
          <AppText variant="display" tone="onPrimarySoft">
            {shown ?? minutes}
          </AppText>
          <AppText tone="onPrimarySoft">分 ／ {limit}</AppText>
        </View>
      ) : (
        <AppText variant="title" tone="onPrimarySoft">
          まだ記録が届いていません（{limit}）
        </AppText>
      )}
      {measuredAt ? (
        <AppText variant="caption" tone="onPrimarySoft">
          {measuredAt} 時点の記録
        </AppText>
      ) : null}
    </Card>
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
