// ボタン。高さ 56・全幅（Figma の主ボタン）。押せる高さは必ず 44 以上。
//   variant: primary（青地・主ボタン。1画面に1つ）/ outline（枠だけ）/ soft（薄い青の小さいボタン「詳しく見る」）/ text（ダイアログの OK など）/
//            pill（枠付きの小さい丸いボタン。Figma のダイアログの「OK」「キャンセル」「ログアウト」。文字の幅だけの大きさ）
//   loading の間は押せない（二重に送らない。保存の確定を待つ間に使う）
//   <Button label="登録する" icon="add" onPress={save} loading={saving} />
import { type ColorName, tokens } from "@contracts/tokens";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { makeStyles, useColors } from "@/lib/theme";
import { AppText, type TextTone } from "./AppText";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "outline" | "soft" | "text" | "pill";

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

// アイコンと読み込み中の丸の色（色の名前。値は今のテーマから引く）
const fg: Record<Variant, ColorName> = {
  primary: "onPrimary",
  outline: "primary",
  soft: "primary",
  text: "primary",
  pill: "primary",
};
const tone: Record<Variant, TextTone> = {
  primary: "onPrimary",
  outline: "primary",
  soft: "primary",
  text: "primary",
  pill: "primary",
};

export function Button({ label, onPress, variant = "primary", icon, trailingIcon, disabled, loading, danger }: Props) {
  const styles = useStyles();
  const c = useColors();
  const off = disabled || loading;
  const color = danger ? c.danger : c[fg[variant]];
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
          {/* 2行に折り返したときも中央にそろえる（ログインの「はじめての人として…」が左寄せになっていた） */}
          <AppText variant="label" tone={danger ? "danger" : tone[variant]} center>
            {label}
          </AppText>
          {trailingIcon && <Icon name={trailingIcon} size={tokens.size.iconSmall} color={color} />}
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    base: {
      minHeight: tokens.size.button,
      // Figma 子03 の「登録する」「キャンセル」は角丸 16（全丸ではない）。soft・pill は下で全丸にする
      borderRadius: tokens.radius.card,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.space[6],
    },
    primary: { backgroundColor: c.primaryFill, alignSelf: "stretch" },
    // Figma の outlined ボタン: 地なし・枠 outline
    outline: {
      borderWidth: tokens.size.border,
      borderColor: c.outline,
      alignSelf: "stretch",
    },
    soft: {
      backgroundColor: c.primarySoft,
      borderRadius: tokens.radius.pill,
      minHeight: tokens.size.touch,
      paddingHorizontal: tokens.space[4],
      alignSelf: "flex-end",
    },
    text: { minHeight: tokens.size.touch, paddingHorizontal: tokens.space[3], alignSelf: "flex-end" },
    pill: {
      minHeight: tokens.size.touch, // Figma は 40 だが、押せる高さの下限 44 にそろえる
      minWidth: tokens.size.pillMinWidth,
      borderRadius: tokens.radius.pill,
      // 24 だと文字を大きくした端末で「キャンセル」「ログアウト」が横に並ばず縦に落ちる（Figma 親07 は横並び）
      paddingHorizontal: tokens.space[4],
      borderWidth: tokens.size.border,
      borderColor: c.outline,
      alignSelf: "center",
    },
    off: { opacity: 0.5 },
    pressed: { opacity: 0.8 },
    row: { flexDirection: "row", alignItems: "center", gap: tokens.space[2] },
  }),
);
