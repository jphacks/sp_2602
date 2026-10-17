// 親01 ホーム（Figma 108:7290）。仮の画面（見出しだけ）。次の担当が作る。
// この画面で作るもの:
//   - Card/UsageSummary: 「今日の使用量」・子どもの今日の分数（usageGet の今日の usedMinutes）＋「分 ／ 上限 260分」（今日の limit）・
//     ProgressBar・「詳しく見る ›」→ /parent/app-usage（親09）
//     記録がない（recorded: false）は「まだ届いていません」（0 分と表示しない）。limit が null は「上限未設定」、kind: "unlimited" は「制限なし」
//   - Card/DailyLimits「今週の使用時間（分）」: call("usageGet", { childId, from: mondayOf(today), to: addDays(その月曜, 6) }) の7日分を
//     BarChart（capacity = 上限、value = 使った分。今日を highlight）＋ Legend（上限・使った時間）
//   - Card/NextTest: useParentData().config の snapshot から nextTest（usage-calc.ts）
//   - 通常上限がまだない（snapshot.usualLimitMinutes が null）なら、上限を決める案内（/pair/usual-limit。Q7）
//   - 親の端末の使用時間は子どもの記録として使わない（MVP_SPEC 5.2）。usePolling で 30 秒ごとに取り直す
import { AppText, Screen } from "@/components";

export default function ParentHome() {
  return (
    <Screen title="Slope（親）" bottomInset={false}>
      <AppText tone="muted">親01 ホーム（これから作ります）</AppText>
    </Screen>
  );
}
