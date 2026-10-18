// tmp/animations/rnweb/whiteboard/components/schedule/PeriodForm.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 期間の入力欄（名前・開始日・終了日）。props はアプリの PeriodForm と同じ。子03・子05・親05・空白期間の画面で同じものを使う。
// 値は持たない（画面が持つ）。開始日を選ぶと、終了日が未入力か前なら開始日にそろえる（logic.ts の withStartDate。アプリと同じ）。
// 形（Figma 子03・子05・子03-B・子05-B）:
//   - 欄の形（手描きの枠・選んでいる欄とエラーの欄は線を太く・エラーの文は欄の下に高さを広げて入る）は TextField・DateField が描く
//   - 欄の間は 16。帯が2つ以上あって画面に入りにくいとき（子05-B）は、PeriodEditor が FormDensity で 8 へ詰めた間を渡す
//   - 画面を開いたときは、欄が上から順にふわっと出る（Reveal。順番は帯の続きから。FormDensity の revealFrom）
// テスト名の欄の右のアイコンは「T」（アプリの名前 title。Figma の text_fields）。
import { tokens } from "@contracts/tokens";
import { createContext, useContext } from "react";
import { Animated, View } from "react-native";
import { DateField, Reveal, TextField } from "@/kids/components";
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

// 置かれた画面からの合図（props を変えずに、画面の混み具合と出る順番を伝える）。
//   gap        : 欄の間（既定 16。PeriodEditor は帯が2つ以上のとき 8 へ動かしながら詰める）
//   revealFrom : 1つ目の欄が、画面の上から何番目か（Reveal の index）
export const FormDensity = createContext<{ gap: number | Animated.AnimatedInterpolation<number>; revealFrom: number }>({
  gap: tokens.layout.cardGap,
  revealFrom: 0,
});

export function PeriodForm({ kind, draft, errors, onChange, editable = true }: Props) {
  const t = periodTexts(kind, "child");
  const { gap, revealFrom } = useContext(FormDensity);
  // 間は2つ目・3つ目の欄の上の余白で空ける（Reveal の中なので、欄と一緒に出る）
  const above = { paddingTop: gap };
  return (
    <View>
      <Reveal index={revealFrom} gap={0}>
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
      </Reveal>
      <Reveal index={revealFrom + 1} gap={0}>
        <Animated.View style={above}>
          <DateField
            label="開始日"
            value={draft.startDate}
            onChange={(d) => onChange(withStartDate(draft, d))}
            error={errors.startDate}
            disabled={!editable}
          />
        </Animated.View>
      </Reveal>
      <Reveal index={revealFrom + 2} gap={0}>
        <Animated.View style={above}>
          <DateField
            label="終了日"
            value={draft.endDate}
            onChange={(d) => onChange(withEndDate(draft, d))}
            // 開始日より前は選べないようにする（選べても送る前の検査で止まる）
            minimumDate={draft.startDate ?? undefined}
            error={errors.endDate}
            disabled={!editable}
          />
        </Animated.View>
      </Reveal>
    </View>
  );
}
