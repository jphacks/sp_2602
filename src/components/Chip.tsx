// 小さい札（Figma の StatusChip「ちょうどいいペース！」・Chip/pending「反映待ち」・ExpiryChip「あと 9分41秒…」）。
//   <Chip icon="check_circle" label="ちょうどいいペース！" />  <Chip tone="warning" label="反映待ち" />
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import { AppText, type TextTone } from "./AppText";
import { Icon, type IconName } from "./Icon";

type Tone = "info" | "success" | "warning" | "danger";
// align: 札の置き場所（既定は中央。一覧の上の「反映待ち」のように左の文とそろえるときは "start"）
// small: 行の中の小さい札（Figma 親16 の行の「反映待ち」。文字 12）
type Props = { label: string; icon?: IconName; tone?: Tone; align?: "center" | "start"; small?: boolean };

const fg: Record<Tone, string> = {
  info: tokens.color.onPrimarySoft,
  success: tokens.color.success,
  warning: tokens.color.warning,
  danger: tokens.color.danger,
};
const textTone: Record<Tone, TextTone> = {
  info: "onPrimarySoft",
  success: "success",
  warning: "warning",
  danger: "danger",
};

export function Chip({ label, icon, tone = "info", align = "center", small = false }: Props) {
  return (
    <View style={[styles.chip, toneStyles[tone], align === "start" && styles.start, small && styles.small]}>
      {icon && <Icon name={icon} size={tokens.size.iconSmall} color={fg[tone]} />}
      {/* Figma の札の文字は太字（子02「ちょうどいいペース！」・子14「あと 9分41秒…」） */}
      <AppText variant={small ? "caption" : "label"} tone={textTone[tone]} strong>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: tokens.space[2],
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[1],
    borderRadius: tokens.radius.pill,
  },
  start: { alignSelf: "flex-start" },
  small: { paddingHorizontal: tokens.space[2], paddingVertical: tokens.space[0] },
});

const toneStyles = StyleSheet.create({
  info: { backgroundColor: tokens.color.primarySoft },
  success: { backgroundColor: tokens.color.successSoft },
  warning: { backgroundColor: tokens.color.warningSoft },
  danger: { backgroundColor: tokens.color.dangerSoft },
});
