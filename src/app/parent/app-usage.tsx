// 親09 アプリごとの利用時間（Figma 108:7663）。下部タブは出たまま。仮の画面（見出しだけ）。次の担当が作る。
// この画面で作るもの:
//   - Card/Total: 今日の合計（usageGet の今日の usedMinutes。制限対象だけの合計）と単位「分」
//   - アプリの行（App/YouTube など）: 頭文字のアイコン・アプリ名・ProgressBar thin（174×8）・分数。UsageDay.apps（多い順）
//     対象外のアプリ（excluded: true）は分けて出す（合計に入らないことが分かるように）
//   - 記録がない日は StateView empty（「まだ届いていません」）。0 分と区別する
import { router } from "expo-router";
import { AppText, Screen } from "@/components";

export default function ParentAppUsage() {
  return (
    <Screen title="アプリごとの利用時間" onBack={() => router.back()} bottomInset={false}>
      <AppText tone="muted">親09 アプリごとの利用時間（これから作ります）</AppText>
    </Screen>
  );
}
