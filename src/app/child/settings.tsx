// 子07 設定（Figma 108:6944）＋ 子06 テーマカラー変更ポップアップ（108:6906）。
// 項目は Figma どおりの3つだけ（Q13。「保護者の設定を見る」は足さない）:
//   「テスト日程の一覧・変更」（件数）→ /child/schedule-list（子10）
//   「テーマカラーの変更」「白色」→ 子06 のダイアログ（選べるのは白だけ。ダークテーマは MVP の後）
//   「ログアウト」→ 確認のダイアログ（LogoutListItem）→ 入口へ
// データ: 件数は useChildData().config（C7 のスナップショットのテスト期間）。取れないときは件数を出さない（0件と言わない）。
// 「←」は Figma にあるので出す（タブの画面なので、押すとホームへ）。
import { router } from "expo-router";
import { useState } from "react";
import { ListItem, LogoutListItem, Screen } from "@/components";
import { testCountLabel } from "@/components/child/child-view";
import { ThemeDialog } from "@/components/child/ThemeDialog";
import { useChildData } from "@/lib/child-data";

export default function ChildSettings() {
  const { config } = useChildData();
  const [themeOpen, setThemeOpen] = useState(false);
  return (
    <Screen title="設定" onBack={() => router.navigate("/child/home")} bottomInset={false}>
      {/* Figma 子07: アイコンは青、項目名は太字。項目名は Figma と同じ所で改行する（幅まかせだと「変／更」で切れる） */}
      <ListItem
        icon="event"
        title={"テスト日程の\n一覧・変更"}
        strong
        value={testCountLabel(config)}
        onPress={() => router.navigate("/child/schedule-list")}
      />
      <ListItem icon="palette" title={"テーマカラーの\n変更"} strong value="白色" onPress={() => setThemeOpen(true)} />
      <LogoutListItem />
      <ThemeDialog visible={themeOpen} onClose={() => setThemeOpen(false)} />
    </Screen>
  );
}
