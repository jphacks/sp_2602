// 子07 設定（Figma 108:6944）＋ 子06 テーマカラー変更ポップアップ（108:6906）。
// 項目は2つ（Q13。「保護者の設定を見る」は足さない）:
//   「テスト日程の一覧・変更」（件数）→ /child/schedule-list（子10）
//   「テーマカラーの変更」「白色」「黒色」「ベージュ」（今のテーマ。子ども用の見た目の3つ。src/kids/lib/theme-store.ts）→ 子06 のダイアログ（選ぶとすぐ全画面の色が変わる。src/lib/theme.tsx）
// 「ログアウト」（と確認の子07-B）は Figma にはあるが出さない（D-136。2026-10-18 ユーザーが決めた）。
//   なぜ: 子どもがログアウトすると端末の制限（Kotlin の監視）が止まり、制限から逃げる道になっていたため。
//   子どもの端末がログイン状態から抜けるのは、保護者が連携を外したとき（401 の family_unlink。D-133）だけ。
//   ほかの道もふさいでいる（session.tsx の signOut は子どもでは何もしない・入口 /pair の「ログアウト」も子どもには出さない。canSignOut）
// データ: 件数は useChildData().config（C7 のスナップショットのテスト期間）。取れないときは件数を出さない（0件と言わない）。
// 「←」は Figma にあるので出す（タブの画面なので、押すとホームへ）。
import { router } from "expo-router";
import { useState } from "react";
import { ListItem, Screen, ThemeDialog } from "@/components";
import { testCountLabel } from "@/components/child/child-view";
import { themeLabel } from "@/kids/lib/theme-store";
import { useChildData } from "@/lib/child-data";
import { useTheme } from "@/lib/theme";

export default function ChildSettings() {
  const { config } = useChildData();
  const { name: theme } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
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
      <ThemeDialog visible={themeOpen} onClose={() => setThemeOpen(false)} />
    </Screen>
  );
}
