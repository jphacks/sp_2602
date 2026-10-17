// 親04 設定（Figma 108:7496）＋ 親06 テーマカラー変更（108:7548）＋ 親07 ログアウト確認（108:7584）。
// 仮の画面: 項目の行き先とログアウトは動く。見た目・件数・テーマカラーの項目は次の担当が作る。
// この画面で作るもの（Q13: Figma どおり4項目）:
//   - ListItem「テスト日程の 一覧・変更」（件数）→ /parent/schedules（親05）
//   - ListItem「制限対象外アプリ」（件数）→ /parent/excluded-apps（親16）
//   - ListItem「テーマカラーの 変更」「白色」→ 親06 のダイアログ（選べるのは白だけ）
//   - ログアウト（LogoutListItem。親07 の確認つき）
//   - 空白期間（Q7。Figma にない）の入口: /parent/blank-periods。置き場所（設定か計画か）は次の担当が決めてよい
import { router } from "expo-router";
import { ListItem, LogoutListItem, Screen } from "@/components";

export default function ParentSettings() {
  return (
    <Screen title="設定" bottomInset={false}>
      <ListItem icon="event" title="テスト日程の一覧・変更" onPress={() => router.push("/parent/schedules")} />
      <ListItem icon="apps" title="制限対象外アプリ" onPress={() => router.push("/parent/excluded-apps")} />
      <ListItem icon="event" title="空白期間（夏休みなど）" onPress={() => router.push("/parent/blank-periods")} />
      <LogoutListItem />
    </Screen>
  );
}
