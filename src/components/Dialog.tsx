// ダイアログ（Figma の Scrim＋Dialog。幅 312・角丸・内側の余白 24）。登録完了・ログイン失敗・削除の確認・ログアウトの確認などに使う。
// 戻るボタン（Android）で閉じたときは onClose を呼ぶ。
//   <Dialog visible={open} icon="check_circle" title="登録しました" body="…" onClose={close}
//     actions={<Button variant="text" label="OK" onPress={close} />} />
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";

type Props = {
  visible: boolean;
  title: string;
  body?: string;
  icon?: IconName;
  iconTone?: "primary" | "danger";
  onClose: () => void;
  actions: ReactNode; // 下に並べるボタン（文字だけのボタンは横に、主ボタンと副ボタンは縦に）
  children?: ReactNode; // 本文の下に足すもの（テーマの選択肢など）
  actionsDirection?: "row" | "column";
};

export function Dialog({
  visible,
  title,
  body,
  icon,
  iconTone = "primary",
  onClose,
  actions,
  children,
  actionsDirection = "row",
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.scrim}>
        <View style={styles.dialog} accessibilityViewIsModal>
          {icon && (
            <View style={styles.icon}>
              <Icon
                name={icon}
                size={tokens.size.iconLarge}
                color={iconTone === "danger" ? tokens.color.danger : tokens.color.primary}
              />
            </View>
          )}
          <AppText variant="title" center={!!icon} accessibilityRole="header">
            {title}
          </AppText>
          {body ? <AppText tone="muted">{body}</AppText> : null}
          {children}
          <View style={actionsDirection === "row" ? styles.actionsRow : styles.actionsColumn}>{actions}</View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: tokens.color.scrim,
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.layout.gutter,
  },
  dialog: {
    width: tokens.layout.dialogWidth,
    maxWidth: "100%",
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.dialog,
    padding: tokens.layout.dialogPadding,
    gap: tokens.space[4],
  },
  icon: { alignItems: "center" },
  actionsRow: { flexDirection: "row", justifyContent: "flex-end", gap: tokens.space[2] },
  actionsColumn: { gap: tokens.layout.listGap },
});
