// 空白期間の一覧・追加・変更・削除（Q7。Figma にない画面。保護者だけ）。下部タブは出たまま。仮の画面（見出しだけ）。次の担当が作る。
// 空白期間（夏休みなど）の日は「制限なし」になり、終わったら元の上限（計画・通常上限で計算した値）に戻る。
// この画面で作るもの:
//   - call("blankPeriodList", { childId }) の一覧（名前・期間）。0件は StateView empty
//   - 追加・変更・削除: blankPeriodCreate / blankPeriodUpdate / blankPeriodDelete（expectedVersion は一覧の configVersion）。
//     入力は TextField「名前」・DateField「開始日」「終了日」。空白期間どうしの重なりは bad_request（入力を残して出す）
//   - 保存の確定を待ってから一覧を取り直し、useParentData().refresh()。反映済み／反映待ち（Q6）
import { router } from "expo-router";
import { AppText, Screen } from "@/components";

export default function ParentBlankPeriods() {
  return (
    <Screen title="空白期間" onBack={() => router.back()} bottomInset={false}>
      <AppText tone="muted">空白期間（夏休みなど）の管理（これから作ります）</AppText>
    </Screen>
  );
}
