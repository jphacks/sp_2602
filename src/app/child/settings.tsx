// 子07 設定（Figma 108:6944）＋ 子06 テーマカラー変更ポップアップ（108:6906）。
// 項目は Figma の3つに「配色の変更」を足した4つ（Q13。「保護者の設定を見る」は足さない）:
//   「テスト日程の一覧・変更」（件数）→ /child/schedule-list（子10）
//   「テーマカラーの変更」「白色」「黒色」「ベージュ」（今のテーマ。子ども用の見た目の3つ。src/kids/lib/theme-store.ts）→ 子06 のダイアログ（選ぶとすぐ全画面の色が変わる。src/lib/theme.tsx）
//   「配色の変更」「赤」「緑」「青」（今の配色。既定は緑）→ 子06 と同じ形のダイアログ（選ぶとすぐ「使った時間」「テスト」の色が変わる。
//     テーマと同じく端末に保存し、ログアウトでは消さない）。テーマカラーのすぐ下に置く
//   「ログアウト」→ 確認のダイアログ（LogoutListItem）→ 入口へ
// データ: 件数は useChildData().config（C7 のスナップショットのテスト期間）。取れないときは件数を出さない（0件と言わない）。
// 「←」は Figma にあるので出す（タブの画面なので、押すとホームへ）。
import { router } from "expo-router";
import { useState } from "react";
import { ColorSchemeDialog, ListItem, LogoutListItem, Screen, ThemeDialog } from "@/components";
import { testCountLabel } from "@/components/child/child-view";
import { colorSchemeLabel, themeLabel } from "@/kids/lib/theme-store";
import { useChildData } from "@/lib/child-data";
import { useColorScheme, useTheme } from "@/lib/theme";

export default function ChildSettings() {
  const { config } = useChildData();
  const { name: theme } = useTheme();
  const { scheme } = useColorScheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const [schemeOpen, setSchemeOpen] = useState(false);
  return (
    <Screen title="設定" onBack={() => router.navigate("/child/home")} bottomInset={false}>
      {/* Figma 子07: アイコンは青、項目名は太字。項目名は幅まかせで折り返す（「変／更」のような切れ方は AppText が防ぐ） */}
      <ListItem
        icon="event"
        title="テスト日程の一覧・変更"
        strong
        value={testCountLabel(config)}
        onPress={() => router.navigate("/child/schedule-list")}
      />
      <ListItem
        icon="palette"
        title="テーマカラーの変更"
        strong
        value={themeLabel(theme)}
        onPress={() => setThemeOpen(true)}
      />
      {/* アイコンは今の部品にある名前から、色に合うもの（テーマカラーと同じ palette） */}
      <ListItem
        icon="palette"
        title="配色の変更"
        strong
        value={colorSchemeLabel(scheme)}
        onPress={() => setSchemeOpen(true)}
      />
      <LogoutListItem />
      <ThemeDialog visible={themeOpen} onClose={() => setThemeOpen(false)} />
      <ColorSchemeDialog visible={schemeOpen} onClose={() => setSchemeOpen(false)} />
    </Screen>
  );
}
