// 子01 ホーム（Figma 108:6714）。子どもが最初に見る画面。上から:
//   （上限に達した日・設定が古いときだけ）帯 → 「今日の使用量」のカード（46 ％ 使いました・進捗バー・詳しく見る ›）→ 「次のテスト」のカード
//   →（まだ許可していないものがあるときだけ）「見守りのための許可」のカード（C4。Figma にない。PermissionGuideCard）
// データ: useChildData()（src/lib/child-data.tsx）の calc（C3 の結果）・config（C7）・test（次のテスト）・blank（今日の空白期間）。
//   表示の決め方は src/components/child/child-view.ts（usageView・nextTestView・staleNotice・shouldOpenLimitScreen）。
// 進む先: 「詳しく見る ›」→ /child/usage（子02）。上限に達したら、その日に1回だけ /child/limit-reached（子11）へ進み、
//   native.showLimitReached()（C4。Kotlin が OS の許す範囲で前面に出す）も呼ぶ。
// 割合を出せない状態（上限未設定・制限なし・権限なし・取得不可）は 0% と出さず、それぞれの文で出す（MVP_SPEC 5.3・AC-09）。
// 子どもには分数を見せない（割合が主。MVP_SPEC 4.2）。
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { Banner, Screen } from "@/components";
import {
  LIMIT_REACHED_MESSAGE,
  nextTestView,
  permissionGuide,
  shouldOpenLimitScreen,
  staleNotice,
  usageView,
} from "@/components/child/child-view";
import { NextTestCard } from "@/components/child/NextTestCard";
import { PermissionGuideCard } from "@/components/child/PermissionGuideCard";
import { UsageSummaryCard } from "@/components/child/UsageSummaryCard";
import { useChildData } from "@/lib/child-data";
import { native } from "@/lib/native";

export default function ChildHome() {
  const { config, calc, test, blank, today, permissions, refresh } = useChildData();
  const view = usageView(calc, blank);
  const stale = staleNotice(config);
  // 子11 を出した日。タブの画面は出たままなので、ここに覚えておけば「閉じる」で戻ったときに出し直さない
  const shownFor = useRef<string | null>(null);

  // ホームが見えている間に上限に達したら、子11 へ進む（C4）。見えていない間は進まない（ほかのタブの操作を邪魔しない）
  useFocusEffect(
    useCallback(() => {
      if (!shouldOpenLimitScreen(calc, today, shownFor.current)) return;
      shownFor.current = today;
      native.showLimitReached(); // Kotlin がないときは何もしない（false）。画面の中の案内は下の push で必ず出す
      router.push("/child/limit-reached");
    }, [calc, today]),
  );

  const onAction = (kind: "permission" | "retry") => {
    if (kind === "permission") native.openPermissionSettings("usageAccess");
    else void refresh();
  };

  return (
    <Screen title="Slope" bottomInset={false}>
      {view.kind === "percent" && view.reached && <Banner icon="block" message={LIMIT_REACHED_MESSAGE} />}
      {stale && <Banner tone="warning" icon="cloud_off" message={stale.message} hint={stale.hint} />}
      <UsageSummaryCard view={view} onDetail={() => router.navigate("/child/usage")} onAction={onAction} />
      <NextTestCard view={nextTestView(config, test)} />
      <PermissionGuideCard
        items={permissionGuide(permissions, native.available)}
        onOpen={(permission) => native.openPermissionSettings(permission)}
      />
    </Screen>
  );
}
