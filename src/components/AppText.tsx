// 文字の部品。大きさ・太さ・色は variant と tone で選ぶ（画面で fontSize を直書きしない）。
//   <AppText variant="title">今日の使用量</AppText>  <AppText variant="caption" tone="muted">10月15日（木）</AppText>
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { StyleSheet, Text, type TextProps } from "react-native";
import { makeStyles } from "@/lib/theme";
import { keepTailTogether } from "./text-wrap";

export type TextVariant = "display" | "ring" | "headline" | "title" | "body" | "small" | "label" | "caption" | "micro";
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
  strong?: boolean; // 太字（semibold）にする（帯の文・タブの選ばれた文字など、Figma で太い所）
  children: ReactNode;
};

export function AppText({
  variant = "body",
  tone = "default",
  center = false,
  strong = false,
  children,
  ...rest
}: Props) {
  const tones = useTones();
  return (
    <Text {...rest} style={[styles[variant], tones[tone], center && styles.center, strong && styles.strong]}>
      {/* 文の終わりの言葉を1〜2文字だけ次の行に落とさない（手で改行を入れずに、どの幅・文字の大きさでも。text-wrap.ts） */}
      {typeof children === "string" ? keepTailTogether(children) : children}
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
  // カードの見出し・強調。Figma の見出しは中くらいの太さなので semibold（bold だと Android の日本語は太すぎる）
  title: { fontSize: tokens.font.lg, lineHeight: tokens.lineHeight.lg, fontWeight: tokens.weight.semibold },
  body: { fontSize: tokens.font.base, lineHeight: tokens.lineHeight.base },
  // 小さめの本文（ダイアログの本文・注意書き・日付。14 の普通の太さ。label は英数字だけ太く見えるので本文には使わない）
  small: { fontSize: tokens.font.sm, lineHeight: tokens.lineHeight.sm },
  // ボタン・タブの文字
  label: { fontSize: tokens.font.sm, lineHeight: tokens.lineHeight.sm, fontWeight: tokens.weight.medium },
  caption: { fontSize: tokens.font.xs, lineHeight: tokens.lineHeight.xs },
  // グラフの日付（「10/12」。Figma 子02・親01 は 10。7本並ぶので caption だと文字を大きくした端末で隣とくっつく）
  micro: { fontSize: tokens.font.xxs, lineHeight: tokens.lineHeight.xxs },
  center: { textAlign: "center" },
  strong: { fontWeight: tokens.weight.semibold },
});

const useTones = makeStyles((c) =>
  StyleSheet.create({
    default: { color: c.text },
    muted: { color: c.muted },
    primary: { color: c.primary },
    onPrimary: { color: c.onPrimary },
    onPrimarySoft: { color: c.onPrimarySoft },
    danger: { color: c.danger },
    warning: { color: c.warning },
    success: { color: c.success },
  }),
);
