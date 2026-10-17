// 親03 振り返り（Figma 108:7413）。仮の画面（見出しだけ）。次の担当が作る。
// この画面で作るもの:
//   - WeekNav（週の表示。前後の週へ送るボタンは Figma にないので、必要なら足す）
//   - Card/Reduced: 「期間」・「分 減りました」・「13% 減」。基準（期間の初めとの比較か、計画の前との比較か）は Figma で2通りあり未決
//     （TODO(未決): FigJam の図の矛盾 16）。決まるまで計算の基準をコメントに書いておく
//   - Card/WeeklyChart: 週ごとの合計（usageGet を6週分。from〜to は最大190日）と上限。凡例「上限」「使った時間」「使った時間（計画の前）」
//   - Note（icon="info"）の説明
//   - BottomAction「アプリごとの利用時間 ›」→ /parent/app-usage（親09）
//   - 記録がない日・0 分の日・取得不可を区別する（UsageDay.recorded）。空白期間の日（limit.kind === "unlimited"）は上限の棒を描かない
import { AppText, Screen } from "@/components";

export default function ParentReview() {
  return (
    <Screen title="振り返り" bottomInset={false}>
      <AppText tone="muted">親03 振り返り（これから作ります）</AppText>
    </Screen>
  );
}
