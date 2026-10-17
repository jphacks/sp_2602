// 空白期間の一覧・追加・変更・削除（Q7。Figma にない画面なので親05 と同じ見た目。保護者だけ）。下部タブは出たまま。
// 空白期間（夏休みなど）の日は「制限なし」になり、終わったら元の上限（計画・通常上限で計算した値）に戻る。
// データ: 見ている子ども（useParentData().child）の blankPeriodList（30秒ごとに取り直す。取れなければ C7 の設定の組を「古い」として出す）。
// 保存: blankPeriodCreate / Update / Delete（expectedVersion つき）。空白期間どうしの重なり・終了日 < 開始日・空の名前は送る前に止める。
//   サーバの確定（C10 の再計算を含む）を待ってから完了を出し、一覧と useParentData().refresh() を取り直す。
// ここへ来る導線（親の設定・計画の画面から）は B4 が作る。「←」→ 前の画面（なければ親04 設定）。
import { todayString } from "@contracts/dates";
import { router } from "expo-router";
import { fallbackFrom, ParentChildGate, PeriodManager } from "@/components/schedule";
import { useParentData } from "@/lib/parent-data";

export default function ParentBlankPeriods() {
  const { config, refresh } = useParentData();
  const snapshot = config && config.status !== "unavailable" ? config.snapshot : null;
  const back = () => (router.canGoBack() ? router.back() : router.navigate("/parent/settings"));

  return (
    <ParentChildGate title="空白期間の一覧・変更" onBack={back}>
      {(childId) => (
        <PeriodManager
          key={childId}
          kind="blank"
          childId={childId}
          today={todayString()}
          fallback={fallbackFrom(snapshot, "blank")}
          afterChange={() => void refresh()}
          onExit={back}
        />
      )}
    </ParentChildGate>
  );
}
