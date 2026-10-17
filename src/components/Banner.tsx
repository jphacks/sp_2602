// 帯の案内（Figma の Banner。アイコン＋文）。tone で色を変える: info（説明）/ warning（古いキャッシュなど）/ danger（エラー）/ success。
//   <Banner icon="edit" message="テストの名前と期間を入れてください" />
//   <Banner tone="warning" icon="cloud_off" message="最新でない可能性があります" />
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, type TextTone } from "./AppText";
import { Icon, type IconName } from "./Icon";

type Tone = "info" | "warning" | "danger" | "success";

type Props = { message: string; hint?: string; icon?: IconName; tone?: Tone; action?: ReactNode };

const bg: Record<Tone, string> = {
  info: tokens.color.primarySoft,
  warning: tokens.color.warningSoft,
  danger: tokens.color.dangerSoft,
  success: tokens.color.successSoft,
};
const fg: Record<Tone, string> = {
  info: tokens.color.onPrimarySoft,
  warning: tokens.color.warning,
  danger: tokens.color.danger,
  success: tokens.color.success,
};
const textTone: Record<Tone, TextTone> = {
  info: "onPrimarySoft",
  warning: "warning",
  danger: "danger",
  success: "success",
};
const defaultIcon: Record<Tone, IconName> = {
  info: "info",
  warning: "warning",
  danger: "error",
  success: "check_circle",
};

export function Banner({ message, hint, icon, tone = "info", action }: Props) {
  return (
    <View
      style={[styles.box, toneStyles[tone]]}
      accessibilityRole={tone === "danger" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
    >
      <Icon name={icon ?? defaultIcon[tone]} color={fg[tone]} />
      <View style={styles.text}>
        <AppText variant="body" tone={textTone[tone]}>
          {message}
        </AppText>
        {hint ? (
          <AppText variant="caption" tone={textTone[tone]}>
            {hint}
          </AppText>
        ) : null}
        {action}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: tokens.space[3],
    padding: tokens.space[4],
    borderRadius: tokens.radius.md,
  },
  text: { flex: 1, gap: tokens.space[1] },
});

const toneStyles = StyleSheet.create({
  info: { backgroundColor: bg.info },
  warning: { backgroundColor: bg.warning },
  danger: { backgroundColor: bg.danger },
  success: { backgroundColor: bg.success },
});
