// 入力欄（Figma の TextField: 312×64・上に小さいラベル・右にアイコン）。数字を入れるときは keyboardType="number-pad"。
// error があれば赤い枠と、その下に文を出す（validation-error。入力した値は消さない）。
//   <TextField label="テストの名前" value={name} onChangeText={setName} />
//   <TextField label="開始上限（分）" value={s} onChangeText={setS} keyboardType="number-pad" error={errors.s} />
import { tokens } from "@contracts/tokens";
import { StyleSheet, TextInput, type TextInputProps, View } from "react-native";
import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";

type Props = Omit<TextInputProps, "style" | "placeholderTextColor"> & {
  label: string;
  error?: string | null;
  trailingIcon?: IconName;
};

export function TextField({ label, error, trailingIcon, ...input }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.field, error ? styles.fieldError : null]}>
        <View style={styles.text}>
          <AppText variant="caption" tone={error ? "danger" : "muted"}>
            {label}
          </AppText>
          <TextInput
            {...input}
            accessibilityLabel={input.accessibilityLabel ?? label}
            placeholderTextColor={tokens.color.muted}
            style={styles.input}
          />
        </View>
        {trailingIcon && <Icon name={trailingIcon} color={tokens.color.muted} />}
      </View>
      {error ? (
        <AppText variant="caption" tone="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

export const fieldStyles = StyleSheet.create({
  // DateField などの「押すと選ぶ」入力欄でも同じ見た目にするため外に出す
  field: {
    minHeight: tokens.size.field,
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space[3],
    paddingHorizontal: tokens.space[4],
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.sm,
    borderWidth: tokens.size.border,
    borderColor: tokens.color.line,
  },
  fieldError: { borderColor: tokens.color.danger },
});

const styles = StyleSheet.create({
  wrap: { gap: tokens.space[1] },
  field: fieldStyles.field,
  fieldError: fieldStyles.fieldError,
  text: { flex: 1, justifyContent: "center" },
  input: { fontSize: tokens.font.base, color: tokens.color.text, paddingVertical: tokens.space[0] },
});
