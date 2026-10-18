// tmp/animations/rnweb/whiteboard/components/ListItem.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// リストの項目（ホワイトボード・設定・テストの一覧）。props はアプリの ListItem（src/components/ListItem.tsx）と同じ。
// 形（Figma 子07・子10・子10-C・入02）: 手で4辺を引いた枠（角 8）。高さ 66（1行）/ 86（2行）。
//   左のアイコンは ink の 24、題名は 16（strong で太字）、右の値は 14 の muted、› は ink の 24。
//   iconTone="primary" も ink（青は使わない）。danger も ink（赤は使わない）。押している間は少し地を付ける
//   <ListItem icon="event" title="テスト日程の一覧・変更" value="2件" onPress={…} />
import { tokens } from "@contracts/tokens";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { makeStyles, useColors } from "@/lib/theme";
import { seedOf, useTool } from "../tools";
import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";

type Props = {
  title: string;
  subtitle?: string; // 2行目（日付・状態など）
  value?: string; // 右側の値（件数・「白色」など）
  icon?: IconName;
  leading?: ReactNode; // アイコンの代わりに左に置くもの
  trailing?: ReactNode; // 右端に置くもの（あれば › は出さない）
  onPress?: () => void;
  danger?: boolean;
  iconTone?: "primary" | "default" | "muted";
  strong?: boolean;
  chevron?: boolean;
  accessibilityLabel?: string;
};

export function ListItem({
  title,
  subtitle,
  value,
  icon,
  leading,
  trailing,
  onPress,
  danger,
  iconTone = "primary",
  strong,
  chevron = true,
  accessibilityLabel,
}: Props) {
  const styles = useStyles();
  const c = useColors();
  const { Frame, values } = useTool();
  const seed = seedOf(title, 19);
  const box = [styles.item, { borderRadius: values.frame.radius }, subtitle ? styles.tall : null];
  const content = (
    <>
      {leading ?? (icon && <Icon name={icon} color={iconTone === "muted" ? c.muted : c.text} />)}
      <View style={styles.text}>
        <AppText variant="body" strong={strong}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" tone="muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="label" tone="muted">
          {value}
        </AppText>
      ) : null}
      {trailing ?? (onPress && !danger && chevron ? <Icon name="chevron_right" color={c.text} /> : null)}
    </>
  );
  if (!onPress)
    return (
      <Frame seed={seed} kind="row" style={box} accessibilityLabel={accessibilityLabel}>
        {content}
      </Frame>
    );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title.replace(/\n/g, "")}
    >
      {({ pressed }) => (
        <Frame seed={seed} kind="row" style={[box, pressed && styles.pressed]}>
          {content}
        </Frame>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    item: {
      minHeight: tokens.size.listItem,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space[4],
      // Figma 子07: 左 22・右 16、2行の題名で高さ 86（上下 19）
      paddingLeft: 22,
      paddingRight: tokens.space[4],
      paddingVertical: 19,
    },
    tall: { minHeight: tokens.size.listItemTall },
    // 右の値との間を少し空ける（Figma 子07: 「テーマカラーの／変更」と2行になる幅）
    text: { flex: 1, gap: tokens.space[1], paddingRight: tokens.space[4] },
    pressed: { backgroundColor: c.surfaceDim },
  }),
);
