// 親05 テスト日程の一覧・変更（Figma 108:7529）。親04 設定から来る。下部タブ（設定が選択中）は出たまま。
// データ: 見ている子ども（useParentData().child）の testPeriodList（30秒ごとに取り直す。取れなければ C7 の設定の組を「古い」として出す）。
// できること: 一覧（近い順・だれが登録したか・お子さんの端末に反映済みか Q6）、追加・変更・削除（子どもの画面と同じ入力と失敗の出し分け）。
//   Figma に親用の登録・変更の画面がないので、この画面の中で一覧と入力を切り替える（src/components/schedule/PeriodManager.tsx）。
// 保存: testPeriodCreate / Update / Delete（expectedVersion つき）。サーバの確定（C10 の再計算を含む）を待ってから完了を出し、
//   一覧と useParentData().refresh() を取り直す。「←」→ 親04 設定。
import { todayString } from "@contracts/dates";
import { router } from "expo-router";
import { fallbackFrom, ParentChildGate, PeriodManager } from "@/components/schedule";
import { useParentData } from "@/lib/parent-data";

export default function ParentSchedules() {
  const { config, refresh } = useParentData();
  const snapshot = config && config.status !== "unavailable" ? config.snapshot : null;
  const back = () => (router.canGoBack() ? router.back() : router.navigate("/parent/settings"));

  return (
    <ParentChildGate title="テスト日程の一覧・変更" onBack={back}>
      {(childId) => (
        <PeriodManager
          key={childId}
          kind="test"
          childId={childId}
          today={todayString()}
          fallback={fallbackFrom(snapshot, "test")}
          afterChange={() => void refresh()}
          onExit={back}
        />
      )}
    </ParentChildGate>
  );
}
