// 子01 ホーム（Figma 108:6714）。仮の画面（見出しだけ）。次の担当が作る。
// この画面で作るもの:
//   - Card/UsageSummary: 「今日の使用量」・大きい数字（useChildData().calc の displayUsedPercent）＋「％ 使いました」・ProgressBar・
//     「詳しく見る ›」（Button variant="soft" → /child/usage）
//   - Card/NextTest（tone="soft"）: 「次のテスト」・テスト名と日付（useChildData().test）・「あと13日」（test.daysUntil。期間中は「テスト中」）。
//     テストが0件でもホームは使える（MVP_SPEC 5.3）→「予定のテストはありません」
//   - calc.state ごとの出し分け（0% と表示しない）: limit_unset（保護者がまだ上限を決めていない）/ unlimited（空白期間中は制限なし。
//     useChildData().blank の名前を出す）/ permission_denied（使用状況へのアクセスの案内 → native.openPermissionSettings("usageAccess")）/
//     usage_unavailable・limit_unknown（取得不可）。config が stale なら「最新でない可能性」（StateView・configViewState）
//   - calc.reached なら /child/limit-reached（子11）へ案内する
//   - 子どもの画面には実際の分数を主に出さない（割合が主。MVP_SPEC 4.2）
import { AppText, Screen } from "@/components";

export default function ChildHome() {
  return (
    <Screen title="Slope" bottomInset={false}>
      <AppText tone="muted">子01 ホーム（これから作ります）</AppText>
    </Screen>
  );
}
