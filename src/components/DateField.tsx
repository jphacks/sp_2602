// 日付の入力欄。押すと Android の日付の選択（@react-native-community/datetimepicker）を開く。値は "YYYY-MM-DD" の文字列でやり取りする。
// 日付は日本時間の「その日」として扱う（contracts/dates.ts と同じ約束。端末の時計の地域に左右されないよう、正午で受け渡す）。
// 表示は年つきの「2026年10月28日（水）」（Figma 子03・子05・親02。文言は contracts/dates.ts の formatDateLongJa）。
//   <DateField label="開始日" value={startDate} onChange={setStartDate} />
import { formatDateLongJa } from "@contracts/dates";
import { tokens } from "@contracts/tokens";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Pressable, StyleSheet, View } from "react-native";
import { useColors } from "@/lib/theme";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useFieldStyles } from "./TextField";

type Props = {
  label: string;
  value: string | null; // "YYYY-MM-DD"。未入力は null
  onChange: (date: string) => void;
  minimumDate?: string;
  maximumDate?: string;
  error?: string | null;
  disabled?: boolean; // 保存している間は開かない（送った値と画面の値がずれないように）
};

// "YYYY-MM-DD" → 端末の地域のその日の正午（選択画面に渡す）
const toLocalNoon = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
};
const fromLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function DateField({ label, value, onChange, minimumDate, maximumDate, error, disabled = false }: Props) {
  const c = useColors();
  const fieldStyles = useFieldStyles();
  const open = () =>
    DateTimePickerAndroid.open({
      mode: "date",
      value: value ? toLocalNoon(value) : new Date(),
      minimumDate: minimumDate ? toLocalNoon(minimumDate) : undefined,
      maximumDate: maximumDate ? toLocalNoon(maximumDate) : undefined,
      onChange: (event, date) => {
        if (event.type === "set" && date) onChange(fromLocal(date));
      },
    });
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={open}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={`${label}${value ? `、${formatDateLongJa(value)}` : "、未入力"}`}
        style={[fieldStyles.field, error ? fieldStyles.fieldError : null]}
      >
        <View style={styles.text}>
          <AppText variant="caption" tone={error ? "danger" : "muted"}>
            {label}
          </AppText>
          <AppText tone={value ? "default" : "muted"}>{value ? formatDateLongJa(value) : "日付を選ぶ"}</AppText>
        </View>
        <Icon name="event" color={c.muted} />
      </Pressable>
      {error ? (
        <AppText variant="caption" tone="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.space[1] },
  text: { flex: 1, justifyContent: "center", gap: tokens.space[1] },
});
