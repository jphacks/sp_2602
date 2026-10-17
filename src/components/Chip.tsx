// 小さい札（Figma の StatusChip「ちょうどいいペース！」・Chip/pending「反映待ち」・ExpiryChip「あと 9分41秒…」）。
//   <Chip icon="check_circle" label="ちょうどいいペース！" />  <Chip tone="warning" label="反映待ち" />
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import { AppText, type TextTone } from "./AppText";
import { Icon, type IconName } from "./Icon";

type Tone = "info" | "success" | "warning" | "danger";
type Props = { label: string; icon?: IconName; tone?: Tone };

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

export function Chip({ label, icon, tone = "info" }: Props) {
  return (
    <View style={[styles.chip, toneStyles[tone]]}>
      {icon && <Icon name={icon} size={tokens.size.iconSmall} color={fg[tone]} />}
      <AppText variant="label" tone={textTone[tone]}>
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
});

const toneStyles = StyleSheet.create({
  info: { backgroundColor: tokens.color.primarySoft },
  success: { backgroundColor: tokens.color.successSoft },
  warning: { backgroundColor: tokens.color.warningSoft },
  danger: { backgroundColor: tokens.color.dangerSoft },
});
