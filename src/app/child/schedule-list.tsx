// 子10 テスト日程の一覧・変更（Figma 108:7005）。仮の画面（見出しだけ）。次の担当が作る。
// この画面で作るもの:
//   - call("testPeriodList", { childId }) の一覧（ListItem icon="event"・テスト名・期間）。0件なら StateView empty（「予定のテストはありません」）
//   - 項目を押す → flow の setEditTest(t) → /child/schedule-edit/{id}（子05）
//   - 「テストを追加」（Button/AddTest）→ /child/schedule-new
//   - 子どももテスト期間を追加・変更・削除できる（Q11）。空白期間は保護者だけ（ここには出さない）
import { AppText, Screen } from "@/components";

export default function ChildScheduleList() {
  return (
    <Screen title="テスト日程の一覧・変更" bottomInset={false}>
      <AppText tone="muted">子10 テスト日程の一覧・変更（これから作ります）</AppText>
    </Screen>
  );
}
