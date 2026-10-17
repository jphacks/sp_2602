// 親04 設定（Figma 108:7496）＋ 親06 テーマカラー変更ポップアップ（108:7548）＋ 親07 ログアウト確認（108:7584。LogoutListItem の中）。
// 項目は Figma 親04 どおり4つ（Q13）: テスト日程・制限対象外アプリ・テーマカラー・ログアウト。
// データ: 件数は useParentData().config（C7 の設定の組）の testPeriods・excludedApps。読み込めていなければ件数を出さない（0件と出さない）。
// 行き先: テスト日程 → /parent/schedules（親05）、制限対象外アプリ → /parent/excluded-apps（親16）、
//         テーマカラー → 親06 のダイアログ（「白色」「黒色」。選ぶとすぐ全画面の色が変わる。子06 と同じ ThemeDialog）、
//         ログアウト → 親07 の確認 → 入口（/）。
// 空白期間（Q7）の入口は、上限に関わる 親02 計画を作る の画面に置いた（設定は Figma の4項目のままにするため）。
import { router } from "expo-router";
import { useState } from "react";
import { ListItem, LogoutListItem, Screen, ThemeDialog } from "@/components";
import { countText } from "@/components/parent/format";
import { useParentData } from "@/lib/parent-data";
import { useTheme } from "@/lib/theme";
import { themeLabel } from "@/lib/theme-store";

export default function ParentSettings() {
  const { config } = useParentData();
  const snapshot = config && config.status !== "unavailable" ? config.snapshot : null;
  const { name: theme } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  return (
    <Screen title="設定" bottomInset={false}>
      {/* Figma 親04: アイコンは青、項目名は太字（子07 と同じ） */}
      <ListItem
        icon="event"
        title="テスト日程の一覧・変更"
        strong
        value={countText(snapshot?.testPeriods.length)}
        onPress={() => router.push("/parent/schedules")}
      />
      <ListItem
        icon="apps"
        title="制限対象外アプリ"
        strong
        value={countText(snapshot?.excludedApps.length)}
        onPress={() => router.push("/parent/excluded-apps")}
      />
      <ListItem
        icon="palette"
        title="テーマカラーの変更"
        strong
        value={themeLabel(theme)}
        onPress={() => setThemeOpen(true)}
      />
      <LogoutListItem />
      <ThemeDialog visible={themeOpen} onClose={() => setThemeOpen(false)} />
    </Screen>
  );
}
