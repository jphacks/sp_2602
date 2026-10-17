// 大きいアイコン＋題名＋本文＋下のボタン、の1画面ぶんの中身（QR・連携の画面: 子13〜子19・親10〜親15・共01〜共03）。
// 待っている間は icon の代わりに spinner を出す（子13「QR発行中」・親12「確かめています…」）。
//   <MessageView icon="check" tone="success" title="連携が完了しました" body="…" actions={<Button label="はじめる" onPress={…} />} />
// tone は丸の色、iconTone はアイコンの色（省くと tone と同じ。Figma は丸を薄い青のまま、アイコンだけ赤・緑にする）
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import type { IconName } from "./Icon";
import { IconBadge } from "./IconBadge";

type Props = {
  title: string;
  body?: string;
  icon?: IconName;
  tone?: "info" | "success" | "warning" | "danger";
  iconTone?: "info" | "success" | "warning" | "danger";
  spinner?: boolean;
  children?: ReactNode; // 本文の下（QR コード・残り時間など）
  actions?: ReactNode; // 下に縦に並べるボタン（主ボタン → 副ボタン）
};

export function MessageView({ title, body, icon, tone = "info", iconTone, spinner, children, actions }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.message} accessibilityLiveRegion="polite">
        {spinner ? (
          <ActivityIndicator size="large" color={tokens.color.primary} />
        ) : (
          icon && <IconBadge icon={icon} tone={tone} iconTone={iconTone} />
        )}
        <AppText variant="title" center accessibilityRole="header">
          {title}
        </AppText>
        {body ? (
          <AppText tone="muted" center>
            {body}
          </AppText>
        ) : null}
        {children}
      </View>
      {actions && <View style={styles.actions}>{actions}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "space-between" },
  message: { flex: 1, alignItems: "center", justifyContent: "center", gap: tokens.space[4] },
  actions: { gap: tokens.layout.listGap },
});
