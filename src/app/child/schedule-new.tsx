// 子03 テスト日程登録（Figma 108:6809）＋ 子04 登録完了ポップアップ（108:6843）。仮の画面（見出しだけ）。次の担当が作る。
// この画面で作るもの:
//   - Banner（icon="edit"）の説明・TextField「テストの名前」・DateField「開始日」「終了日」（元デザインの単一日付を期間に拡張。MVP_SPEC 5.1）
//   - 「登録する」（主ボタン）: call("testPeriodCreate", { childId, expectedVersion: config の configVersion, name, startDate, endDate })。
//     保存の確定を待ってから子04 のダイアログ（Dialog icon="check_circle"・OK）。そのあと useChildData().refresh()
//   - 失敗: bad_request（終了日が開始日より前・期間の重なり）→ 入力を残したまま ErrorBanner（validation-error）。
//     conflict（ほかの端末が先に変更）→ 取り直してもう一度。通信失敗 → 再試行
//   - 「キャンセル」（outline）→ 入力を消してホームへ
import { AppText, Screen } from "@/components";

export default function ChildScheduleNew() {
  return (
    <Screen title="テスト日程の登録" bottomInset={false}>
      <AppText tone="muted">子03 テスト日程登録（これから作ります）</AppText>
    </Screen>
  );
}
