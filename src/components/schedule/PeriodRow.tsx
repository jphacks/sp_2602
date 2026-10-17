// 一覧の1行（Figma 子10・親05 の ListItem: カレンダーのアイコン・テスト名・日付・›）。
// Figma は日付1つを右に出しているが、期間（〜）にすると長いので2行目に出す。期間中・終了は右に小さく出す。
import { ListItem } from "@/components";
import { type Period, periodRowText } from "./logic";

type Props = { period: Period; today: string; showCreator?: boolean; onPress: (p: Period) => void };

export function PeriodRow({ period, today, showCreator, onPress }: Props) {
  const t = periodRowText(period, today, { showCreator });
  return (
    <ListItem
      icon="event"
      title={t.title}
      subtitle={t.subtitle}
      value={t.value}
      onPress={() => onPress(period)}
      accessibilityLabel={t.accessibilityLabel}
    />
  );
}
