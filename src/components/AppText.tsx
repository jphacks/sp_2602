// 文字の部品。大きさ・太さ・色は variant と tone で選ぶ（画面で fontSize を直書きしない）。
//   <AppText variant="title">今日の使用量</AppText>  <AppText variant="caption" tone="muted">10月15日（木）</AppText>
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { StyleSheet, Text, type TextProps } from "react-native";

export type TextVariant = "display" | "ring" | "headline" | "title" | "body" | "label" | "caption";
export type TextTone =
  | "default"
  | "muted"
  | "primary"
  | "onPrimary"
  | "onPrimarySoft"
  | "danger"
  | "warning"
  | "success";

type Props = Omit<TextProps, "style"> & {
  variant?: TextVariant;
  tone?: TextTone;
  center?: boolean;
  children: ReactNode;
};

export function AppText({ variant = "body", tone = "default", center = false, children, ...rest }: Props) {
  return (
    <Text {...rest} style={[styles[variant], tones[tone], center && styles.center]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  // 大きい数字（子01 の「46」、親01 の「120」）
  display: { fontSize: tokens.font.display, lineHeight: tokens.lineHeight.display, fontWeight: tokens.weight.bold },
  // 円形ゲージの中の数字（子02）
  ring: { fontSize: tokens.font.ring, lineHeight: tokens.lineHeight.ring, fontWeight: tokens.weight.bold },
  // 上のバーの題名
  headline: { fontSize: tokens.font.xl, lineHeight: tokens.lineHeight.xl, fontWeight: tokens.weight.regular },
  // カードの見出し・強調
  title: { fontSize: tokens.font.lg, lineHeight: tokens.lineHeight.lg, fontWeight: tokens.weight.bold },
  body: { fontSize: tokens.font.base, lineHeight: tokens.lineHeight.base },
  // ボタン・タブの文字
  label: { fontSize: tokens.font.sm, lineHeight: tokens.lineHeight.sm, fontWeight: tokens.weight.medium },
  caption: { fontSize: tokens.font.xs, lineHeight: tokens.lineHeight.xs },
  center: { textAlign: "center" },
});

const tones = StyleSheet.create({
  default: { color: tokens.color.text },
  muted: { color: tokens.color.muted },
  primary: { color: tokens.color.primary },
  onPrimary: { color: tokens.color.onPrimary },
  onPrimarySoft: { color: tokens.color.onPrimarySoft },
  danger: { color: tokens.color.danger },
  warning: { color: tokens.color.warning },
  success: { color: tokens.color.success },
});
