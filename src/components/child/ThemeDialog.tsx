// 子06 テーマカラー変更ポップアップ（Figma 108:6906）。「白色」「黒色」の2つを出し、選べるのは白だけ（Q13。ダークテーマは MVP の後）。
// 黒色は押せない見た目にして「準備中」と添える（選んだのに変わらない、を起こさない）。
// 選んだ色はどこにも保存しない（白しかないので保存するものがない）。
//   <ThemeDialog visible={open} onClose={() => setOpen(false)} />
import { tokens } from "@contracts/tokens";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText, Button, Dialog, Icon } from "@/components";
import { THEME_OPTIONS, type ThemeKey } from "./child-view";

const SELECTED: ThemeKey = "white";

export function ThemeDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Dialog
      visible={visible}
      title="テーマカラーの変更"
      onClose={onClose}
      actions={<Button variant="text" label="OK" onPress={onClose} />}
    >
      <View style={styles.list} accessibilityRole="radiogroup">
        {THEME_OPTIONS.map((o) => {
          const selected = o.key === SELECTED;
          return (
            <Pressable
              key={o.key}
              disabled={!o.enabled}
              onPress={onClose}
              accessibilityRole="radio"
              accessibilityLabel={o.enabled ? o.label : `${o.label}（準備中）`}
              accessibilityState={{ checked: selected, disabled: !o.enabled }}
              style={[styles.option, selected && styles.selected, !o.enabled && styles.off]}
            >
              <View style={[styles.swatch, o.key === "white" ? styles.white : styles.black]} />
              <View style={styles.text}>
                <AppText variant="title">{o.label}</AppText>
                {!o.enabled && (
                  <AppText variant="caption" tone="muted">
                    準備中
                  </AppText>
                )}
              </View>
              {selected && <Icon name="check" color={tokens.color.primary} />}
            </Pressable>
          );
        })}
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  list: { gap: tokens.space[3] },
  option: {
    minHeight: tokens.size.button,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space[4],
    paddingHorizontal: tokens.space[4],
    borderRadius: tokens.radius.md,
    borderWidth: tokens.size.border,
    borderColor: tokens.color.line,
  },
  selected: { backgroundColor: tokens.color.primarySoft, borderColor: tokens.color.primary },
  off: { opacity: 0.5 },
  swatch: {
    width: tokens.size.icon,
    height: tokens.size.icon,
    borderRadius: tokens.radius.pill,
    borderWidth: tokens.size.border,
    borderColor: tokens.color.line,
  },
  white: { backgroundColor: tokens.color.white },
  black: { backgroundColor: tokens.color.black },
  text: { flex: 1 },
});
