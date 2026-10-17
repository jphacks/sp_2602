// リストの項目（設定・テストの一覧・アプリの一覧。Figma の ListItem: 高さ 66（1行）/ 86（2行）、左にアイコン、右に値と ›）。
// onPress があれば押せる（右に › を出す）。trailing に Switch などを置ける。
//   <ListItem icon="event" title="テスト日程の一覧・変更" value="2件" onPress={…} />
//   <ListItem title="ログアウト" icon="logout" danger onPress={confirmLogout} />
// アイコンの色は既定で primary（Figma 子07・子10・親04 の青いアイコン）。iconTone="default" で黒にできる。
// strong で題名を太字にする（Figma 子07・子10 の項目名）
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
  iconTone?: "primary" | "default" | "muted"; // アイコンの色（既定 primary。danger のときは赤）
  strong?: boolean; // 題名を太字にする
  chevron?: boolean; // 押せるときの右の › を出すか（既定 true。Figma 子07・親04 の「ログアウト」は › なし）
  accessibilityLabel?: string;
};

const iconColors = { primary: tokens.color.primary, default: tokens.color.text, muted: tokens.color.muted } as const;

export function ListItem({
  title,
  subtitle,
  value,
  icon,
  leading,
  trailing,
  onPress,
  danger,
  iconTone = "primary",
  strong,
  chevron = true,
  accessibilityLabel,
}: Props) {
  const content = (
    <>
      {leading ?? (icon && <Icon name={icon} color={danger ? tokens.color.danger : iconColors[iconTone]} />)}
      <View style={styles.text}>
        {/* Figma の項目名は 16 の中くらいの太さ（カードの見出しより小さい） */}
        <AppText variant="body" strong={strong} tone={danger ? "danger" : "default"}>
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
      {trailing ?? (onPress && !danger && chevron ? <Icon name="chevron_right" color={tokens.color.muted} /> : null)}
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
      accessibilityLabel={accessibilityLabel ?? title.replace(/\n/g, "")}
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
