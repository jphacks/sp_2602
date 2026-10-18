// 子07 設定（Figma 108:6944）＋ 子06 テーマカラー変更ポップアップ（108:6906）。
// 項目は Figma の「テスト日程」「テーマカラー」に「配色の変更」を足した3つ（Q13。「保護者の設定を見る」は足さない）:
//   「テスト日程の一覧・変更」（件数）→ /child/schedule-list（子10）
//   「テーマカラーの変更」「白色」「黒色」「ベージュ」（今のテーマ。子ども用の見た目の3つ。src/kids/lib/theme-store.ts）→ 子06 のダイアログ（選ぶとすぐ全画面の色が変わる。src/lib/theme.tsx）
//   「配色の変更」「赤」「緑」「青」（今の配色。既定は緑）→ 子06 と同じ形のダイアログ（選ぶとすぐ「使った時間」「テスト」の色が変わる。
//     テーマと同じく端末に保存する）。テーマカラーのすぐ下に置く
// 「ログアウト」（と確認の子07-B）は Figma にはあるが出さない（D-136。2026-10-18 ユーザーが決めた）。
//   なぜ: 子どもがログアウトすると端末の制限（Kotlin の監視）が止まり、制限から逃げる道になっていたため。
//   子どもの端末がログイン状態から抜けるのは、保護者が連携を外したとき（401 の family_unlink。D-133）だけ。
//   ほかの道もふさいでいる（session.tsx の signOut は子どもでは何もしない・入口 /pair の「ログアウト」も子どもには出さない。canSignOut）
// データ: 件数は useChildData().config（C7 のスナップショットのテスト期間）。取れないときは件数を出さない（0件と言わない）。
// 「←」は Figma にあるので出す（タブの画面なので、押すとホームへ）。
import { router } from "expo-router";
import { useState } from "react";
import { ColorSchemeDialog, ListItem, Screen, ThemeDialog } from "@/components";
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
      <ThemeDialog visible={themeOpen} onClose={() => setThemeOpen(false)} />
      <ColorSchemeDialog visible={schemeOpen} onClose={() => setSchemeOpen(false)} />
    </Screen>
  );
}
