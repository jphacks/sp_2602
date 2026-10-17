// 子07 設定（Figma 108:6944）＋ 子06 テーマカラー変更ポップアップ（108:6906）。
// 仮の画面: ログアウトだけは動く。ほかは次の担当が作る。
// この画面で作るもの（Q13: Figma どおり3項目。「保護者の設定を見る」は足さない）:
//   - ListItem「テスト日程の 一覧・変更」（件数）→ /child/schedule-list
//   - ListItem「テーマカラーの 変更」「白色」→ 子06 のダイアログ（選べるのは白だけ。ダークテーマは MVP の後）
//   - ログアウト（LogoutListItem。確認のダイアログつき）
import { AppText, LogoutListItem, Screen } from "@/components";

export default function ChildSettings() {
  return (
    <Screen title="設定" bottomInset={false}>
      <AppText tone="muted">子07 設定（テスト日程・テーマカラーの項目はこれから作ります）</AppText>
      <LogoutListItem />
    </Screen>
  );
}
