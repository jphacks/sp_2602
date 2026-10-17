// 子11 利用時間が終わった画面（上限到達の案内。Figma 108:7024）。下部タブは出たまま（この画面のタブはないので、どれも選ばれない）。上から:
//   帯「今日のスマホの時間は終わりです。続きはあしたにしよう」→ 「今日の使用量」100%（詳しく見る はない）→ 「次のテスト」→
//   「お勧めアプリはこちらです ›」（学習用アプリを開く）→ 「閉じる」
// データ: useChildData() の calc（C3）・config（C7）・test（次のテスト）・blank。表示の決め方は src/components/child/child-view.ts。
// 進む先: 「閉じる」→ /child/home（子01。ホームは同じ日に2回はここへ進まない）。「お勧めアプリ」→ native.openApp（C4）。
// ホーム（子01）が上限到達を見つけて進んでくる。Kotlin 側は native.showLimitReached() でこの案内を前面に出す予定（窓口だけ）。
// OS の制約: Android は他のアプリを無条件には止められない（MVP_SPEC 2章）。この画面は「案内」で、遮断を約束しない文にする。
import { tokens } from "@contracts/tokens";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Banner, Button, Dialog, Screen } from "@/components";
import {
  LIMIT_REACHED_MESSAGE,
  nextTestView,
  openFirstApp,
  RECOMMENDED_APP_PACKAGES,
  usageView,
} from "@/components/child/child-view";
import { NextTestCard } from "@/components/child/NextTestCard";
import { RecommendAppsCard } from "@/components/child/RecommendAppsCard";
import { UsageSummaryCard } from "@/components/child/UsageSummaryCard";
import { useChildData } from "@/lib/child-data";
import { native } from "@/lib/native";

export default function ChildLimitReached() {
  const { config, calc, test, blank, refresh } = useChildData();
  const view = usageView(calc, blank);
  // お勧めアプリを開けなかったとき（Kotlin がない・どのアプリも入っていない）の案内
  const [cannotOpen, setCannotOpen] = useState(false);

  // 上限の設定が変わった・日付が変わったなどで、もう到達していないときは帯の文を変える（「終わり」と言い続けない）
  const reached = view.kind === "percent" && view.reached;

  const openRecommended = () => {
    if (!openFirstApp(RECOMMENDED_APP_PACKAGES, native.openApp)) setCannotOpen(true);
  };
  const onAction = (kind: "permission" | "retry") => {
    if (kind === "permission") native.openPermissionSettings("usageAccess");
    else void refresh();
  };

  return (
    <Screen
      title="Slope"
      bottomInset={false}
      footer={
        <>
          <RecommendAppsCard onPress={openRecommended} />
          <Button variant="outline" label="閉じる" onPress={() => router.navigate("/child/home")} />
        </>
      }
    >
      {reached && <Banner icon="block" message={LIMIT_REACHED_MESSAGE} />}
      {view.kind === "percent" && !view.reached && <Banner icon="info" message="今日の時間は、まだ残っています" />}
      <UsageSummaryCard view={view} onAction={onAction} />
      <NextTestCard view={nextTestView(config, test)} />
      <View style={styles.note}>
        {/* MVP_SPEC 5.1 子11「OS 制約の説明」。Figma にはない小さな注記 */}
        <AppText variant="caption" tone="muted">
          電話など大切なアプリは、このあとも使えます
        </AppText>
      </View>
      <Dialog
        visible={cannotOpen}
        title="お勧めアプリを開けませんでした"
        body="勉強に使うアプリを、おうちの人と一緒に決めよう"
        onClose={() => setCannotOpen(false)}
        actions={<Button variant="text" label="OK" onPress={() => setCannotOpen(false)} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: tokens.space[1] },
});
