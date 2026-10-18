// tmp/animations/rnweb/whiteboard/components/DateField.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 日付の入力欄（ホワイトボード）。props と動きはアプリの DateField（src/components/DateField.tsx）と同じ。
// 押すと Android の日付の選択を開く。値は "YYYY-MM-DD"。表示は年つきの「2026年10月28日（水）」（formatDateLongJa）。
// 見た目は TextField と同じ手描きの枠（エラーのときは線を太く・欄の下にエラーの文）。右のアイコンは event（ink）。
//   <DateField label="開始日" value={startDate} onChange={setStartDate} />
import { formatDateLongJa } from "@contracts/dates";
import { tokens } from "@contracts/tokens";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Pressable, StyleSheet, View } from "react-native";
import { useColors } from "@/lib/theme";
import { seedOf } from "../tools";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { FieldBox, FieldError } from "./TextField";

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
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <FieldBox seed={seedOf(label, 13)} strong={!!error}>
          <View style={styles.text}>
            <AppText variant="caption" tone="muted">
              {label}
            </AppText>
            <AppText tone={value ? "default" : "muted"}>{value ? formatDateLongJa(value) : "日付を選ぶ"}</AppText>
          </View>
          <Icon name="event" color={c.text} />
        </FieldBox>
      </Pressable>
      <FieldError error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.space[1] },
  text: { flex: 1, justifyContent: "center", gap: 1 },
  pressed: { opacity: 0.8 },
});
