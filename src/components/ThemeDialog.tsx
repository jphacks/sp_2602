// 子06・親06 テーマカラー変更ポップアップ（Figma 子06 112:12973・親06 112:13613。ダーク 112:14085・112:14725。2つは同じ形）。
// 「白色」（ライト）「黒色」（ダーク）を出し、押すとすぐ全画面の色が切り替わる（src/lib/theme.tsx の setTheme。端末に保存する）。
// 選んでいるほうに薄い青の地・青い枠・右に ✓。OK で閉じる（選び直しは閉じずにできる）。
//   <ThemeDialog visible={open} onClose={() => setOpen(false)} />
import { tokens } from "@contracts/tokens";
import { Pressable, StyleSheet, View } from "react-native";
import { makeStyles, useColors, useTheme } from "@/lib/theme";
import { THEME_OPTIONS } from "@/lib/theme-store";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";

export function ThemeDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const c = useColors();
  const { name: current, setTheme } = useTheme();
  return (
    <Dialog
      visible={visible}
      title="テーマカラーの変更"
      centered
      onClose={onClose}
      actions={<Button variant="pill" label="OK" onPress={onClose} />}
    >
      <View style={styles.list} accessibilityRole="radiogroup">
        {THEME_OPTIONS.map((o) => {
          const selected = o.name === current;
          return (
            <Pressable
              key={o.name}
              onPress={() => setTheme(o.name)}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked: selected }}
              style={[styles.option, selected && styles.selected]}
            >
              <View style={[styles.swatch, o.name === "light" ? styles.white : styles.black]} />
              <View style={styles.text}>
                <AppText variant="title">{o.label}</AppText>
              </View>
              {selected && <Icon name="check" color={c.primary} />}
            </Pressable>
          );
        })}
      </View>
    </Dialog>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    list: { gap: tokens.space[3] },
    option: {
      minHeight: tokens.size.button,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space[4],
      paddingHorizontal: tokens.space[4],
      borderRadius: tokens.radius.md,
      borderWidth: tokens.size.border,
      borderColor: c.line,
    },
    selected: { backgroundColor: c.primarySoft, borderColor: c.primary },
    // 色見本はテーマで変わらない白と黒（テーマの名前そのものの色）
    swatch: {
      width: tokens.size.icon,
      height: tokens.size.icon,
      borderRadius: tokens.radius.pill,
      borderWidth: tokens.size.border,
      borderColor: c.line,
    },
    white: { backgroundColor: c.white },
    black: { backgroundColor: c.black },
    text: { flex: 1 },
  }),
);
