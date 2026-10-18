// tmp/animations/rnweb/whiteboard/components/MessageView.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 大きいアイコン＋題名＋本文＋下のボタン（ホワイトボード・QR・連携の画面 子13〜子19・共01〜共03・入01・子18-B）。
// props はアプリの MessageView と同じ。待っている間は icon の代わりに今の道具のくるくる（useTool().Spinner。ホワイトボードは黒マーカー）。
// 題名は太字 20、本文は 14 の muted（中央）。tone・iconTone で色を変えない（IconBadge）。
//   <MessageView icon="check" tone="success" title="連携が完了しました" body="…" actions={<Button label="はじめる" onPress={…} />} />
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useTool } from "../tools";
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
  const { Spinner } = useTool();
  return (
    <View style={styles.root}>
      <View style={styles.message} accessibilityLiveRegion="polite">
        {spinner ? (
          <Spinner accessibilityLabel={title} />
        ) : (
          icon && <IconBadge icon={icon} tone={tone} iconTone={iconTone} />
        )}
        {/* Figma 共01・共03・子15: 題名は見出しの書体 20 で幅 283 まで（黒板の子16「QRコードをつくれませんでした」は1行・ホワイトボードの共01 は2行になる幅）、本文は 274 まで（共03 の1文が1行に入り、子16 の文は「、」の後ろで折り返す幅）（長い文は「、」の後ろ・言葉の切れ目で折り返す） */}
        <View style={styles.titleBox}>
          <AppText variant="message" center accessibilityRole="header">
            {title}
          </AppText>
        </View>
        {body ? (
          <View style={styles.bodyBox}>
            <AppText variant="small" tone="muted" center phrases>
              {body}
            </AppText>
          </View>
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
  titleBox: { maxWidth: 283, alignSelf: "center" },
  bodyBox: { maxWidth: 274, alignSelf: "center" },
  actions: { gap: tokens.layout.listGap },
});
