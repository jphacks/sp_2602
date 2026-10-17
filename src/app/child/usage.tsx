// 子02 使用割合（使用割合確認画面。Figma 108:6741）。上から:
//   「今日の使用量」「10月15日（木）」→ 円形ゲージ（46 % 使いました）→ ペースの札「ちょうどいいペース！」→
//   「今週の使用割合」の棒グラフ（月〜日。今日は濃い青）→ 「ホームに戻る」
// データ: 今日は useChildData() の calc（C3）。今週の過去の日は、この端末の記録（native.getDailyUsage(日付)。C2）と
//   その日の日別上限（C7 の dailyLimits）から、C3 と同じ計算で割合を出す（child-view.ts の dayCalc）。取れない日は棒なし・「--」。
// 表示の決め方は src/components/child/child-view.ts（usageView・paceView・weekBars）。
// 進む先: 「←」「ホームに戻る」→ /child/home（子01）。権限なしなら使用状況へのアクセスの設定を開く。
// 割合を出せない状態（上限未設定・制限なし・権限なし・取得不可）はゲージを出さず、その状態の文を出す（0% と出さない）。
import { formatDateJa } from "@contracts/dates";
import type { NativeUsageResult } from "@contracts/native";
import { tokens } from "@contracts/tokens";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Banner, BarChart, Button, Chip, Gauge, Screen } from "@/components";
import {
  dayCalc,
  paceView,
  staleNotice,
  usageView,
  weekBars,
  weekBarsLabel,
  weekDates,
} from "@/components/child/child-view";
import { UsageMessage } from "@/components/child/UsageMessage";
import { useChildData } from "@/lib/child-data";
import { native } from "@/lib/native";
import type { UsageCalc } from "@/lib/usage-calc";

export default function ChildUsage() {
  const { config, calc, blank, today, refresh } = useChildData();
  const snapshot = config && config.status !== "unavailable" ? config.snapshot : null;
  const view = usageView(calc, blank);
  const pace = paceView(calc);
  const stale = staleNotice(config);

  // 今週の、今日より前の日の端末の記録（日付 → C2 の結果）。画面を開くたび・日付が変わったときに読み直す
  const pastDates = useMemo(() => weekDates(today).filter((d) => d < today), [today]);
  const [pastUsage, setPastUsage] = useState<Record<string, NativeUsageResult>>({});
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void Promise.all(pastDates.map(async (d) => [d, await native.getDailyUsage(d)] as const)).then((rows) => {
        if (alive) setPastUsage(Object.fromEntries(rows));
      });
      return () => {
        alive = false;
      };
    }, [pastDates]),
  );

  // 割合は設定（日別上限・対象外アプリ）が変わるたびに計算し直す（端末の記録は取り直さない）
  const bars = useMemo(() => {
    const days: Record<string, UsageCalc | null | undefined> = { [today]: calc ?? undefined };
    for (const d of pastDates) {
      const u = pastUsage[d];
      days[d] = u ? dayCalc(u, snapshot, d) : undefined;
    }
    return weekBars(today, days);
  }, [today, calc, pastDates, pastUsage, snapshot]);

  const goHome = () => router.navigate("/child/home");
  const onAction = (kind: "permission" | "retry") => {
    if (kind === "permission") native.openPermissionSettings("usageAccess");
    else void refresh();
  };

  return (
    <Screen
      title="使用割合"
      onBack={goHome}
      bottomInset={false}
      footer={<Button variant="outline" label="ホームに戻る" onPress={goHome} />}
    >
      {stale && <Banner tone="warning" icon="cloud_off" message={stale.message} hint={stale.hint} />}
      <View style={styles.heading}>
        <AppText variant="title" center accessibilityRole="header">
          今日の使用量
        </AppText>
        <AppText tone="muted" center>
          {formatDateJa(today)}
        </AppText>
      </View>
      {view.kind === "message" ? (
        <UsageMessage message={view.message} onAction={onAction} center />
      ) : (
        // 読み込み中は「--」（0% にしない）
        // 中央の数字は黒（Figma 子02。子01 の青い数字と違う）
        <Gauge percent={view.kind === "percent" ? view.percent : null} caption="使いました" valueTone="default" />
      )}
      {pace && <Chip tone={pace.tone} icon={pace.icon} label={pace.label} />}
      <View style={styles.week}>
        <AppText variant="label">今週の使用割合</AppText>
        <BarChart bars={bars} scaleMax={100} accessibilityLabel={weekBarsLabel(bars)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: tokens.space[1] },
  week: { gap: tokens.space[3] },
});
