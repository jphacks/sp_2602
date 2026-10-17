// 子02 利用割合（使用割合確認画面。Figma 108:6741）。仮の画面（見出しだけ）。次の担当が作る。
// この画面で作るもの:
//   - 「今日の使用量」「10月15日（木）」（formatDateJa(today)）
//   - Gauge（240×240）: calc.state === "ok" なら displayUsedPercent、それ以外は null（「--」。0% にしない）
//   - StatusChip（Chip）: 到達状態・ペース（例「ちょうどいいペース！」。文言の決め方は次の担当）
//   - WeeklyChart「今週の使用割合」（BarChart scaleMax={100}）: 今日の分は calc、過去の日は native.getDailyUsage(日付) と
//     その日の日別上限（limitForDate）から calcUsage で割合を出す。取れない日・未来の日は value: null（棒を描かない）
//   - 上限 0 分・未設定・制限なし（空白期間）・取得不可を区別する（usage-calc.ts の UsageCalc の state）
import { AppText, Screen } from "@/components";

export default function ChildUsage() {
  return (
    <Screen title="利用割合" bottomInset={false}>
      <AppText tone="muted">子02 利用割合（これから作ります）</AppText>
    </Screen>
  );
}
