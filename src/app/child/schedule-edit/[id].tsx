// 子05 テスト日程の変更（Figma 108:6878）。一覧（子10）から来る。下部タブは出たまま。仮の画面（見出しだけ）。次の担当が作る。
// この画面で作るもの:
//   - 道筋の id（useLocalSearchParams）のテスト期間を、flow の editTest（なければ testPeriodList で取り直す）から出す
//   - TextField「テストの名前」・DateField「開始日」「終了日」→「変更する」: call("testPeriodUpdate", { childId, expectedVersion, id, … })
//   - 「削除する」→ 確認のダイアログ → call("testPeriodDelete", { childId, expectedVersion, id })
//   - 保存・削除の確定を待ってから一覧へ戻り、useChildData().refresh()（C10 の再計算 → C7 の取り直し）
//   - 失敗の出し分けは子03 と同じ（bad_request は入力を残す・conflict は取り直し・not_found は一覧へ）
import { router, useLocalSearchParams } from "expo-router";
import { AppText, Screen } from "@/components";

export default function ChildScheduleEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen title="テスト日程の変更" onBack={() => router.back()} bottomInset={false}>
      <AppText tone="muted">子05 テスト日程の変更（これから作ります）: {id}</AppText>
    </Screen>
  );
}
