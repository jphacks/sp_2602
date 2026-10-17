// 親16 制限対象外アプリの管理（Figma 108:9446）。下部タブは出たまま。仮の画面（見出しだけ）。次の担当が作る。
// この画面で作るもの（C9。保存できるのは保護者だけ。サーバも確かめる）:
//   - Banner（icon="edit"）の説明・小見出し「子どものアプリ」
//   - アプリの行: 頭文字のアイコン・アプリ名・状態（「反映済み」/ Chip「反映待ち」）・Switch（対象外にするか）
//     候補は TODO(保留): Q15 のため contracts/fixtures.ts の mockExcludedAppCandidates（学習ノート・英単語カード・動画アプリ・ゲーム）
//     状態: call("excludedAppsGet", { childId }) の childAppliedVersion が、そのアプリの sinceVersion 以上なら「反映済み」（Q6）
//   - 「保存する」: call("excludedAppsSave", { childId, expectedVersion, apps })（全件の置き換え）。確定を待ってから「保存しました」
//   - 必須例外（電話など）は親が外せない別枠（usage-calc.ts の ESSENTIAL_PACKAGES）
import { router } from "expo-router";
import { AppText, Screen } from "@/components";

export default function ParentExcludedApps() {
  return (
    <Screen title="制限対象外アプリ" onBack={() => router.back()} bottomInset={false}>
      <AppText tone="muted">親16 制限対象外アプリの管理（これから作ります）</AppText>
    </Screen>
  );
}
