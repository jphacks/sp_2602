// 親04 設定（Figma 108:7496）＋ 親06 テーマカラー変更ポップアップ（108:7548）＋ 親07 ログアウト確認（108:7584。LogoutListItem の中）。
// 項目は Figma 親04 どおり4つ（Q13）: テスト日程・制限対象外アプリ・テーマカラー・ログアウト。
// データ: 件数は useParentData().config（C7 の設定の組）の testPeriods・excludedApps。読み込めていなければ件数を出さない（0件と出さない）。
// 行き先: テスト日程 → /parent/schedules（親05）、制限対象外アプリ → /parent/excluded-apps（親16）、
//         テーマカラー → 親06 のダイアログ（選べるのは白だけ。Q13）、ログアウト → 親07 の確認 → 入口（/）。
// 空白期間（Q7）の入口は、上限に関わる 親02 計画を作る の画面に置いた（設定は Figma の4項目のままにするため）。
import { tokens } from "@contracts/tokens";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Button, Dialog, Icon, ListItem, LogoutListItem, Screen } from "@/components";
import { countText } from "@/components/parent/format";
import { useParentData } from "@/lib/parent-data";

export default function ParentSettings() {
  const { config } = useParentData();
  const snapshot = config && config.status !== "unavailable" ? config.snapshot : null;
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
      <ListItem icon="palette" title="テーマカラーの変更" strong value="白色" onPress={() => setThemeOpen(true)} />
      <LogoutListItem />
      <Dialog
        visible={themeOpen}
        title="テーマカラーの変更"
        centered
        onClose={() => setThemeOpen(false)}
        actions={<Button variant="pill" label="OK" onPress={() => setThemeOpen(false)} />}
      >
        {/* MVP では白だけ（Q13・MVP_SPEC 3.2: ダークテーマは MVP の後）。黒色は選べないことが分かるように出す */}
        <ThemeOption label="白色" swatch="white" selected />
        <ThemeOption label="黒色（準備中）" swatch="black" disabled />
      </Dialog>
    </Screen>
  );
}

function ThemeOption(props: { label: string; swatch: "white" | "black"; selected?: boolean; disabled?: boolean }) {
  const { label, swatch, selected, disabled } = props;
  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: !!selected, disabled: !!disabled }}
      accessibilityLabel={label}
      style={[styles.option, selected && styles.selected, disabled && styles.disabled]}
    >
      <View style={[styles.swatch, swatches[swatch]]} />
      <View style={styles.flex}>
        <AppText variant="body" tone={disabled ? "muted" : "default"}>
          {label}
        </AppText>
      </View>
      {selected ? <Icon name="check" color={tokens.color.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  option: {
    minHeight: tokens.size.touch,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space[3],
    paddingHorizontal: tokens.space[4],
    paddingVertical: tokens.space[3],
    borderRadius: tokens.radius.md,
    borderWidth: tokens.size.border,
    borderColor: tokens.color.line,
  },
  selected: { borderColor: tokens.color.primary, backgroundColor: tokens.color.primarySoft },
  disabled: { backgroundColor: tokens.color.surfaceDim },
  swatch: {
    width: tokens.size.icon,
    height: tokens.size.icon,
    borderRadius: tokens.radius.pill,
    borderWidth: tokens.size.border,
    borderColor: tokens.color.line,
  },
});

const swatches = StyleSheet.create({
  white: { backgroundColor: tokens.color.white },
  black: { backgroundColor: tokens.color.black },
});
