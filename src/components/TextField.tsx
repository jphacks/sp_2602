// 入力欄（Figma の TextField: 312×64・上に小さいラベル・右にアイコン）。数字を入れるときは keyboardType="number-pad"。
// error があれば赤い枠と、その下に文を出す（validation-error。入力した値は消さない）。
//   <TextField label="テストの名前" value={name} onChangeText={setName} />
//   <TextField label="開始上限（分）" value={s} onChangeText={setS} keyboardType="number-pad" error={errors.s} />
import { tokens } from "@contracts/tokens";
import { StyleSheet, TextInput, type TextInputProps, View } from "react-native";
import { makeStyles, useColors } from "@/lib/theme";
import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";

type Props = Omit<TextInputProps, "style" | "placeholderTextColor"> & {
  label: string;
  error?: string | null;
  trailingIcon?: IconName;
};

export function TextField({ label, error, trailingIcon, ...input }: Props) {
  const styles = useStyles();
  const fieldStyles = useFieldStyles();
  const c = useColors();
  return (
    <View style={styles.wrap}>
      <View style={[fieldStyles.field, error ? fieldStyles.fieldError : null]}>
        <View style={styles.text}>
          <AppText variant="caption" tone={error ? "danger" : "muted"}>
            {label}
          </AppText>
          <TextInput
            {...input}
            accessibilityLabel={input.accessibilityLabel ?? label}
            placeholderTextColor={c.muted}
            // カーソルと選択の色をアクセントに合わせる（Android の既定は緑）
            cursorColor={c.primary}
            selectionColor={c.primarySoft}
            // 選んだ文字の両端のつまみ。省くと selectionColor（薄い青）になり、白色では白地に、黒色では暗い地に溶けて見えない
            selectionHandleColor={c.primary}
            style={styles.input}
          />
        </View>
        {trailingIcon && <Icon name={trailingIcon} color={c.muted} />}
      </View>
      {error ? (
        <AppText variant="caption" tone="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

// DateField などの「押すと選ぶ」入力欄でも同じ見た目にするため外に出す（部品の中で const fieldStyles = useFieldStyles();）
export const useFieldStyles = makeStyles((c) =>
  StyleSheet.create({
    field: {
      minHeight: tokens.size.field,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.space[3],
      paddingHorizontal: tokens.space[4],
      // Figma の TextField（outlined）: 地なし・枠 outline
      borderRadius: tokens.radius.sm,
      borderWidth: tokens.size.border,
      borderColor: c.outline,
    },
    fieldError: { borderColor: c.danger },
  }),
);

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    wrap: { gap: tokens.space[1] },
    text: { flex: 1, justifyContent: "center" },
    // Android の TextInput は既定で左右に余白があり、ラベルと値の左端がずれるので 0 にする
    input: {
      fontSize: tokens.font.base,
      color: c.text,
      paddingVertical: tokens.space[0],
      paddingHorizontal: tokens.space[0],
    },
  }),
);
