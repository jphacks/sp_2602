// tmp/animations/rnweb/whiteboard/components/Dialog.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// ダイアログ（ホワイトボード）。props と動きはアプリの Dialog（src/components/Dialog.tsx）と同じ（暗幕＋fade。速さを変えない）。
// 形（Figma 子04・子06・子09・子20・子07-B・kids-design-rules.md 3 章）:
//   - 本体＝ボードの白の板（dialog）に、黒のマーカーで手で4辺を引いた枠（角 8）。幅 312・内側の余白 24
//   - 題名＝Yusei Magic 22（中央）。本文＝14 の muted
//   - 上のアイコン＝ink の 32。成功（check・check_circle）は、出てから 120ms 後に黒マーカーでチェックを 320ms で引く
//   - ボタンが1つ（OK）のときは文字だけのボタン、2つのときは線だけの丸いボタンを同じ幅で横に並べる（Button の ButtonContext）
//   - 赤・緑は使わない（iconTone の success・danger も ink）
import { tokens } from "@contracts/tokens";
import { Children, Fragment, isValidElement, type ReactNode, useEffect } from "react";
import { Keyboard, Modal, StyleSheet, View } from "react-native";
import { makeStyles, useColors } from "@/lib/theme";
import { seedOf, useTool } from "../tools";
import { AppText } from "./AppText";
import { ButtonContext } from "./Button";
import { Icon, type IconName } from "./Icon";

type IconTone = "primary" | "success" | "danger";

type Props = {
  visible: boolean;
  title: string;
  body?: string;
  icon?: IconName;
  iconTone?: IconTone;
  onClose: () => void;
  actions: ReactNode;
  children?: ReactNode;
  actionsDirection?: "row" | "column";
  centered?: boolean;
};

// 並べるボタンの数（<>…</> の中も数える）
function countActions(node: ReactNode): number {
  let n = 0;
  Children.forEach(node, (child) => {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment)
      n += countActions(child.props.children);
    else if (child != null && child !== false) n += 1;
  });
  return n;
}

export function Dialog({
  visible,
  title,
  body,
  icon,
  iconTone: _iconTone = "primary",
  onClose,
  actions,
  children,
  actionsDirection = "row",
  centered = false,
}: Props) {
  const styles = useStyles();
  const c = useColors();
  const { Frame, Check, values } = useTool();
  const count = countActions(actions);
  const actionsStyle =
    actionsDirection === "column"
      ? styles.actionsColumn
      : count >= 2
        ? styles.actionsFill
        : centered
          ? styles.actionsCenter
          : styles.actionsRow;
  // 開くときに入力欄の焦点を外す（閉じたときに Android がその入力欄へ焦点を戻し、キーボードがまた開くのを防ぐ。アプリと同じ）
  useEffect(() => {
    if (visible) Keyboard.dismiss();
  }, [visible]);
  const success = icon === "check" || icon === "check_circle";
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.scrim}>
        <Frame
          seed={seedOf(title, 17)}
          kind="dialog"
          style={[styles.dialog, { borderRadius: values.frame.radius }]}
          accessibilityViewIsModal
        >
          {icon && (
            <View style={styles.icon}>
              {success ? (
                <Check size={tokens.size.iconLarge} start={visible} ring={icon === "check_circle"} />
              ) : (
                // Figma 子09: エラーのダイアログは「丸に！」ではなく三角の warning（帯の danger だけが丸に！）
                <Icon name={icon === "error" ? "warning" : icon} size={tokens.size.iconLarge} color={c.text} />
              )}
            </View>
          )}
          <AppText variant="headline" center={centered || !!icon} accessibilityRole="header">
            {title}
          </AppText>
          {body ? (
            // アイコンのあるダイアログは本文も中央に（Figma 子18。題名はアプリと同じくアイコンがあれば中央）
            <AppText variant="small" tone="muted" center={centered || !!icon} phrases>
              {body}
            </AppText>
          ) : null}
          {children}
          <ButtonContext.Provider
            value={{
              single: count === 1 && actionsDirection === "row",
              fill: count >= 2 && actionsDirection === "row",
            }}
          >
            <View style={actionsStyle}>{actions}</View>
          </ButtonContext.Provider>
        </Frame>
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
      padding: tokens.layout.dialogPadding,
      gap: tokens.space[4],
    },
    icon: { alignItems: "center" },
    actionsRow: { flexDirection: "row", justifyContent: "flex-end", gap: tokens.space[2] },
    actionsCenter: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: tokens.space[3] },
    // 2つの丸いボタンを同じ幅で横に（文字を大きくした端末で入らなければ折り返す）
    actionsFill: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space[3] },
    actionsColumn: { gap: tokens.layout.listGap },
  }),
);
