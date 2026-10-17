// 役割選び（Q1。Figma にない画面）の大きな選択肢1つ。白いカード（Figma のリスト項目と同じ: 白地・細い枠・角丸 16）に
// 青いアイコン・太字の名前・短い説明・右の「›」を並べる。カード全体を押せる。
import { tokens } from "@contracts/tokens";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Icon, type IconName } from "@/components";
import { makeStyles, useColors } from "@/lib/theme";

type Props = { icon: IconName; title: string; description: string; onPress: () => void };

export function RoleChoice({ icon, title, description, onPress }: Props) {
  const styles = useStyles();
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Icon name={icon} size={tokens.size.iconLarge} color={c.primary} />
      <View style={styles.text}>
        <AppText variant="title">{title}</AppText>
        <AppText tone="muted">{description}</AppText>
      </View>
      <Icon name="chevron_right" />
    </Pressable>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    card: {
      minHeight: tokens.size.listItemTall,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space[4],
      padding: tokens.layout.cardPadding,
      backgroundColor: c.surface,
      borderRadius: tokens.radius.card,
      borderWidth: tokens.size.border,
      borderColor: c.line,
    },
    pressed: { backgroundColor: c.primarySoft },
    text: { flex: 1, gap: tokens.space[1] },
  }),
);
