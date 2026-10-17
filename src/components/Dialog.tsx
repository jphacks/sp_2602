// ダイアログ（Figma の Scrim＋Dialog。幅 312・角丸・内側の余白 24・地は薄い紫（色の名前 dialog））。
// 登録完了・ログイン失敗・削除の確認・ログアウトの確認などに使う。戻るボタン（Android）で閉じたときは onClose を呼ぶ。
//   <Dialog visible={open} icon="check_circle" iconTone="success" title="登録しました。" body="…" centered onClose={close}
//     actions={<Button variant="pill" label="OK" onPress={close} />} />
// centered: 題名・本文・ボタンを中央にそろえる（Figma 子04・子06・子09・親07 の形。ボタンは variant="pill" の枠付きの丸いボタン）
import { type ColorName, tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { makeStyles, useColors } from "@/lib/theme";
import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";

type IconTone = "primary" | "success" | "danger";

type Props = {
  visible: boolean;
  title: string;
  body?: string;
  icon?: IconName;
  iconTone?: IconTone; // アイコンの色（success = 緑。子04 の登録完了）
  onClose: () => void;
  actions: ReactNode; // 下に並べるボタン（文字だけのボタンは横に、主ボタンと副ボタンは縦に）
  children?: ReactNode; // 本文の下に足すもの（テーマの選択肢など）
  actionsDirection?: "row" | "column";
  centered?: boolean; // 題名・本文・ボタンを中央にそろえる（アイコンがあるときの題名は、いつも中央）
};

// アイコンの色（色の名前。値は今のテーマから引く）
const iconColor: Record<IconTone, ColorName> = {
  primary: "primary",
  success: "success",
  danger: "danger",
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
  centered = false,
}: Props) {
  const styles = useStyles();
  const c = useColors();
  const actionsStyle =
    actionsDirection === "column" ? styles.actionsColumn : centered ? styles.actionsCenter : styles.actionsRow;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.scrim}>
        <View style={styles.dialog} accessibilityViewIsModal>
          {icon && (
            <View style={styles.icon}>
              <Icon name={icon} size={tokens.size.iconLarge} color={c[iconColor[iconTone]]} />
            </View>
          )}
          <AppText variant="headline" center={centered || !!icon} accessibilityRole="header">
            {title}
          </AppText>
          {body ? (
            // Figma のダイアログの本文は 14（題名より小さい）
            <AppText variant="small" tone="muted" center={centered}>
              {body}
            </AppText>
          ) : null}
          {children}
          <View style={actionsStyle}>{actions}</View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    scrim: {
      flex: 1,
      backgroundColor: c.scrim,
      alignItems: "center",
      justifyContent: "center",
      padding: tokens.layout.gutter,
    },
    dialog: {
      width: tokens.layout.dialogWidth,
      maxWidth: "100%",
      backgroundColor: c.dialog,
      borderRadius: tokens.radius.dialog,
      padding: tokens.layout.dialogPadding,
      gap: tokens.space[4],
    },
    icon: { alignItems: "center" },
    actionsRow: { flexDirection: "row", justifyContent: "flex-end", gap: tokens.space[2] },
    actionsCenter: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: tokens.space[3] },
    actionsColumn: { gap: tokens.layout.listGap },
  }),
);
