// 子11 利用時間が終わった画面（上限到達の案内。Figma 108:7024）。下部タブは出たまま（タブに項目はない）。仮の画面（見出しだけ）。
// この画面で作るもの:
//   - Banner（icon="block"）: 今日の上限に達したことの説明
//   - Card/UsageSummary（ボタンなし）: 使用済み 100%・ProgressBar、Card/NextTest
//   - Card/RecommendApps「お勧めアプリはこちらです」→ 学習用アプリへの誘導（native.openApp。TODO(未決): 学習用アプリの一覧）
//   - 「閉じる」→ ホームへ
//   - OS の制約の説明: Android は他のアプリを無条件には止められない。案内を出せる範囲で出す（MVP_SPEC 2章・C4）
//   - Kotlin 側からは native.showLimitReached() で前面に出す予定（窓口だけ。contracts/native.ts）
import { AppText, Screen } from "@/components";

export default function ChildLimitReached() {
  return (
    <Screen title="今日の利用時間" bottomInset={false}>
      <AppText tone="muted">子11 利用時間が終わった画面（これから作ります）</AppText>
    </Screen>
  );
}
