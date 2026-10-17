// リストの項目（設定・テストの一覧・アプリの一覧。Figma の ListItem: 高さ 66（1行）/ 86（2行）、左にアイコン、右に値と ›）。
// onPress があれば押せる（右に › を出す）。trailing に Switch などを置ける。
//   <ListItem icon="event" title="テスト日程の一覧・変更" value="2件" onPress={…} />
//   <ListItem title="ログアウト" icon="logout" danger onPress={confirmLogout} />
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";

type Props = {
  title: string;
  subtitle?: string; // 2行目（日付・状態など）
  value?: string; // 右側の値（件数・「白色」など）
  icon?: IconName;
  leading?: ReactNode; // アイコンの代わりに左に置くもの（アプリの頭文字など）
  trailing?: ReactNode; // 右端に置くもの（Switch など。あれば › は出さない）
  onPress?: () => void;
  danger?: boolean;
  accessibilityLabel?: string;
};

export function ListItem({
  title,
  subtitle,
  value,
  icon,
  leading,
  trailing,
  onPress,
  danger,
  accessibilityLabel,
}: Props) {
  const content = (
    <>
      {leading ?? (icon && <Icon name={icon} color={danger ? tokens.color.danger : tokens.color.text} />)}
      <View style={styles.text}>
        <AppText variant="body" tone={danger ? "danger" : "default"}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" tone="muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="label" tone="muted">
          {value}
        </AppText>
      ) : null}
      {trailing ?? (onPress && !danger ? <Icon name="chevron_right" color={tokens.color.muted} /> : null)}
    </>
  );
  if (!onPress)
    return (
      <View style={[styles.item, subtitle ? styles.tall : null]} accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [styles.item, subtitle ? styles.tall : null, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    minHeight: tokens.size.listItem,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space[4],
    paddingHorizontal: tokens.space[5],
    paddingVertical: tokens.space[3],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.card,
    borderWidth: tokens.size.border,
    borderColor: tokens.color.line,
  },
  tall: { minHeight: tokens.size.listItemTall },
  text: { flex: 1, gap: tokens.space[1] },
  pressed: { backgroundColor: tokens.color.surfaceDim },
});
