// 「◯時間◯分」の入力欄（Figma 親02 の時間の欄: 上に小さいラベル、値「5時間0分」、右に時計のアイコン）。
// 時間と分の2つの数字の欄を1つの枠に並べる。値は文字のまま持ち（打ちかけを消さない）、分への直し方は format.ts の parseDuration。
//   <DurationField label="開始上限（今の1日の使用時間）" value={form.start} onChange={…} error={errors.start} />
import { tokens } from "@contracts/tokens";
import { StyleSheet, TextInput, View } from "react-native";
import { AppText, Icon } from "@/components";
import { fieldStyles } from "@/components/TextField";
import type { DurationText } from "./format";

type Props = {
  label: string;
  value: DurationText;
  onChange: (v: DurationText) => void;
  error?: string | null;
  hint?: string; // 欄の下の補足（エラーがないときだけ出す）
};

export function DurationField({ label, value, onChange, error, hint }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={[fieldStyles.field, error ? fieldStyles.fieldError : null]}>
        <View style={styles.text}>
          <AppText variant="caption" tone={error ? "danger" : "muted"}>
            {label}
          </AppText>
          <View style={styles.row}>
            <TextInput
              value={value.hours}
              onChangeText={(hours) => onChange({ ...value, hours })}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="0"
              placeholderTextColor={tokens.color.muted}
              cursorColor={tokens.color.primary}
              selectionColor={tokens.color.primarySoft}
              accessibilityLabel={`${label}、時間`}
              style={styles.input}
            />
            <AppText>時間</AppText>
            <TextInput
              value={value.minutes}
              onChangeText={(minutes) => onChange({ ...value, minutes })}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="0"
              placeholderTextColor={tokens.color.muted}
              cursorColor={tokens.color.primary}
              selectionColor={tokens.color.primarySoft}
              accessibilityLabel={`${label}、分`}
              style={styles.input}
            />
            <AppText>分</AppText>
          </View>
        </View>
        <Icon name="clock" color={tokens.color.muted} />
      </View>
      {error ? (
        <AppText variant="caption" tone="danger">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.space[1] },
  text: { flex: 1, justifyContent: "center", paddingVertical: tokens.space[2] },
  row: { flexDirection: "row", alignItems: "center", gap: tokens.space[1] },
  input: {
    minWidth: tokens.space[8],
    fontSize: tokens.font.base,
    color: tokens.color.text,
    textAlign: "right",
    paddingVertical: tokens.space[0],
    paddingHorizontal: tokens.space[1],
    borderBottomWidth: tokens.size.border,
    borderBottomColor: tokens.color.line,
  },
});
