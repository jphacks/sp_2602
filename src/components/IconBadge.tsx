// 大きいアイコンの丸（96×96。QR・連携の画面の Message 領域の上、Figma の IconBadge）。
//   <IconBadge icon="check" tone="success" />
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import { Icon, type IconName } from "./Icon";

type Tone = "info" | "success" | "warning" | "danger";
type Props = { icon: IconName; tone?: Tone };

const fg: Record<Tone, string> = {
  info: tokens.color.primary,
  success: tokens.color.success,
  warning: tokens.color.warning,
  danger: tokens.color.danger,
};

export function IconBadge({ icon, tone = "info" }: Props) {
  return (
    <View style={[styles.badge, toneStyles[tone]]}>
      <Icon name={icon} size={tokens.size.iconBadgeGlyph} color={fg[tone]} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: tokens.size.iconBadge,
    height: tokens.size.iconBadge,
    borderRadius: tokens.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});

const toneStyles = StyleSheet.create({
  info: { backgroundColor: tokens.color.primarySoft },
  success: { backgroundColor: tokens.color.successSoft },
  warning: { backgroundColor: tokens.color.warningSoft },
  danger: { backgroundColor: tokens.color.dangerSoft },
});
