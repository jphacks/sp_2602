// 期間の入力欄（名前・開始日・終了日）。子03・子05・親05・空白期間の画面で同じものを使う。
// Figma 子03 は「テスト名」「開始日」「終了日」の3つ（子05 は日付1つだが、MVP_SPEC 5.1 に合わせて期間に拡張した）。
// 値は持たない（画面が持つ）。開始日を選ぶと、終了日が未入力か前なら開始日にそろえる（logic.ts の withStartDate）。
import { tokens } from "@contracts/tokens";
import { StyleSheet, View } from "react-native";
import { DateField, TextField } from "@/components";
import {
  NAME_MAX,
  type PeriodDraft,
  type PeriodErrors,
  type PeriodKind,
  periodTexts,
  withEndDate,
  withStartDate,
} from "./logic";

type Props = {
  kind: PeriodKind;
  draft: PeriodDraft;
  errors: PeriodErrors;
  onChange: (next: PeriodDraft) => void;
  editable?: boolean;
};

export function PeriodForm({ kind, draft, errors, onChange, editable = true }: Props) {
  const t = periodTexts(kind, "child");
  return (
    <View style={styles.fields}>
      <TextField
        label={t.nameLabel}
        value={draft.name}
        onChangeText={(name) => onChange({ ...draft, name })}
        placeholder={t.namePlaceholder}
        trailingIcon="title"
        maxLength={NAME_MAX}
        returnKeyType="done"
        editable={editable}
        error={errors.name}
      />
      <DateField
        label="開始日"
        value={draft.startDate}
        onChange={(d) => onChange(withStartDate(draft, d))}
        error={errors.startDate}
      />
      <DateField
        label="終了日"
        value={draft.endDate}
        onChange={(d) => onChange(withEndDate(draft, d))}
        // 開始日より前は選べないようにする（選べても送る前の検査で止まる）
        minimumDate={draft.startDate ?? undefined}
        error={errors.endDate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: tokens.layout.cardGap },
});
