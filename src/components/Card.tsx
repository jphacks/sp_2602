// カード（角丸 16・白地に細い枠）。tone="soft" は薄い青の地（Figma の「次のテスト」のカード）。
//   <Card><AppText variant="title">今日の使用量</AppText>…</Card>
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { makeStyles } from "@/lib/theme";

type Props = { tone?: "default" | "soft"; children: ReactNode };

export function Card({ tone = "default", children }: Props) {
  const styles = useStyles();
  return <View style={[styles.card, tone === "soft" && styles.soft]}>{children}</View>;
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: tokens.radius.card,
      borderWidth: tokens.size.border,
      borderColor: c.line,
      padding: tokens.layout.cardPadding,
      gap: tokens.space[3],
    },
    soft: { backgroundColor: c.primarySoft, borderColor: c.primarySoft },
  }),
);
