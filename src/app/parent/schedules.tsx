// 親05 テスト日程の一覧・変更（Figma 108:7529）。下部タブは出たまま。仮の画面（見出しだけ）。次の担当が作る。
// この画面で作るもの:
//   - call("testPeriodList", { childId }) の一覧（テスト名・期間・作った人 createdByRole）。0件は StateView empty
//   - 追加・編集・削除（testPeriodCreate / testPeriodUpdate / testPeriodDelete。expectedVersion は一覧の configVersion）。
//     子どもの画面（子03・子05）と同じ入力欄と失敗の出し分け。保存の確定を待ってから一覧を取り直し、useParentData().refresh()
//   - 反映済み／反映待ち（childAppliedVersion と configVersion を比べる。Q6）
import { router } from "expo-router";
import { AppText, Screen } from "@/components";

export default function ParentSchedules() {
  return (
    <Screen title="テスト日程の一覧・変更" onBack={() => router.back()} bottomInset={false}>
      <AppText tone="muted">親05 テスト日程の一覧・変更（これから作ります）</AppText>
    </Screen>
  );
}
