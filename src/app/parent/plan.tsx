// 親02 計画を作る（Figma 108:7371）。仮の画面（見出しだけ）。次の担当が作る。
// この画面で作るもの（Q14）:
//   - call("planGet", { childId }) で今の計画・通常上限・configVersion を読む
//   - DateField「計画開始日」（今日以降）・TextField「開始上限（分）」S・「最終目標（分）」G（3つとも必須。0〜1440 の整数・G ≤ S）・
//     「通常上限（分）」（Q7 で紐づけ直後に決めた値。ここでも変えられる）・Hint（説明）
//   - 「計画を作る」: call("planSave", { childId, expectedVersion, planStartDate, startLimitMinutes, finalGoalMinutes, usualLimitMinutes })。
//     保存と C10 の再計算の確定を待ってから「保存しました」。そのあと useParentData().refresh()
//   - 失敗: bad_request（開始日が今日より前・G > S・テスト期間の重なり）→ 入力を残して ErrorBanner。conflict → 取り直し
//   - 子どもの端末への反映: planGet の childAppliedVersion < configVersion なら「反映待ち」、同じなら「反映済み」（Q6）
import { AppText, Screen } from "@/components";

export default function ParentPlan() {
  return (
    <Screen title="計画を作る" bottomInset={false}>
      <AppText tone="muted">親02 計画を作る（これから作ります）</AppText>
    </Screen>
  );
}
