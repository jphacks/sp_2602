// 親04 設定（Figma 108:7496）＋ 親06 テーマカラー変更ポップアップ（108:7548）＋ 親07 ログアウト確認（108:7584。LogoutListItem の中）。
// 項目は Figma 親04 の4つ（Q13）: テスト日程・制限対象外アプリ・テーマカラー・ログアウト。
//   これに Figma にない「制限する Web サイト」（D-111）を「制限対象外アプリ」の下に足した。
// データ: 件数は useParentData().config（C7 の設定の組）の testPeriods・excludedApps・blockedSites。読み込めていなければ件数を出さない（0件と出さない）。
// 行き先: テスト日程 → /parent/schedules（親05）、制限対象外アプリ → /parent/excluded-apps（親16）、
//         制限する Web サイト → /parent/blocked-sites（Figma にない。D-111）、
//         テーマカラー → 親06 のダイアログ（「白色」「黒色」。選ぶとすぐ全画面の色が変わる。子06 と同じ ThemeDialog）、
//         ログアウト → 親07 の確認 → 入口（/）。
// 空白期間（Q7）の入口は、上限に関わる 親02 計画を作る の画面に置いた（設定は Figma の4項目のままにするため）。
import { router } from "expo-router";
import { useState } from "react";
import { ListItem, LogoutListItem, Reveal, RevealGroup, Screen, ThemeDialog } from "@/components";
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
      {/* Figma 親04: アイコンは青、項目名は太字（子07 と同じ）。開いたときは上から順にふわっと出す */}
      <RevealGroup>
        <Reveal index={0}>
          <ListItem
            icon="event"
            title="テスト日程の一覧・変更"
            strong
            value={countText(snapshot?.testPeriods.length)}
            onPress={() => router.push("/parent/schedules")}
          />
        </Reveal>
        <Reveal index={1}>
          <ListItem
            icon="apps"
            title="制限対象外アプリ"
            strong
            value={countText(snapshot?.excludedApps.length)}
            onPress={() => router.push("/parent/excluded-apps")}
          />
        </Reveal>
        {/* Figma にない行（D-111）。「制限対象外アプリ」と同じ並びに置く（どちらも子どもの端末の制限の決まり） */}
        <Reveal index={2}>
          <ListItem
            icon="language"
            title="制限する Web サイト"
            strong
            value={countText(snapshot?.blockedSites.length)}
            onPress={() => router.push("/parent/blocked-sites")}
          />
        </Reveal>
        <Reveal index={3}>
          <ListItem
            icon="palette"
            title="テーマカラーの変更"
            strong
            value={themeLabel(theme)}
            onPress={() => setThemeOpen(true)}
          />
        </Reveal>
        <Reveal index={4}>
          <LogoutListItem />
        </Reveal>
      </RevealGroup>
      <ThemeDialog visible={themeOpen} onClose={() => setThemeOpen(false)} />
    </Screen>
  );
}
