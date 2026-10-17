// ボタン。高さ 56・全幅（Figma の主ボタン）。押せる高さは必ず 44 以上。
//   variant: primary（青地・主ボタン。1画面に1つ）/ outline（枠だけ）/ soft（薄い青の小さいボタン「詳しく見る」）/ text（ダイアログの OK など）
//   loading の間は押せない（二重に送らない。保存の確定を待つ間に使う）
//   <Button label="登録する" icon="add" onPress={save} loading={saving} />
import { tokens } from "@contracts/tokens";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { AppText, type TextTone } from "./AppText";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "outline" | "soft" | "text";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName; // 文字の左のアイコン
  trailingIcon?: IconName; // 文字の右のアイコン（「詳しく見る ›」）
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean; // 文字を赤くする（ログアウトなど。text と outline で使う）
};

const fg: Record<Variant, string> = {
  primary: tokens.color.onPrimary,
  outline: tokens.color.primary,
  soft: tokens.color.primary,
  text: tokens.color.primary,
};
const tone: Record<Variant, TextTone> = { primary: "onPrimary", outline: "primary", soft: "primary", text: "primary" };

export function Button({ label, onPress, variant = "primary", icon, trailingIcon, disabled, loading, danger }: Props) {
  const off = disabled || loading;
  const color = danger ? tokens.color.danger : fg[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [styles.base, styles[variant], off && styles.off, pressed && styles.pressed]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <View style={styles.row}>
          {icon && <Icon name={icon} size={tokens.size.iconSmall} color={color} />}
          <AppText variant="label" tone={danger ? "danger" : tone[variant]}>
            {label}
          </AppText>
          {trailingIcon && <Icon name={trailingIcon} size={tokens.size.iconSmall} color={color} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: tokens.size.button,
    borderRadius: tokens.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.space[6],
  },
  primary: { backgroundColor: tokens.color.primary, alignSelf: "stretch" },
  outline: {
    borderWidth: tokens.size.border,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
    alignSelf: "stretch",
  },
  soft: {
    backgroundColor: tokens.color.primarySoft,
    minHeight: tokens.size.touch,
    paddingHorizontal: tokens.space[4],
    alignSelf: "flex-end",
  },
  text: { minHeight: tokens.size.touch, paddingHorizontal: tokens.space[3], alignSelf: "flex-end" },
  off: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space[2] },
});
