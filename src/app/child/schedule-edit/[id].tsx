// 子05 テスト日程の変更（Figma 108:6878）。子10 一覧から来る。下部タブは出たまま。
// データ: 変更する1件は、一覧から渡された flow の editTest（すぐ出す）と、testPeriodList（id で取り直す。今の版もここから）。
//   一覧がサーバから取れてその中にない → 「このテスト日程は見つかりません」（ほかの端末で削除された）→ 一覧へ。
// 入力: テスト名・開始日・終了日（Figma は「日付」1つだが MVP_SPEC 5.1 で期間に拡張）。Figma にない「削除する」も足した（MVP_SPEC: 削除・削除確認）。
// 保存: testPeriodUpdate / testPeriodDelete（expectedVersion = 変更を始めたときの版）。サーバの確定（C10 の再計算を含む）を待ってから
//   「変更しました。」「削除しました。」→ OK で 子10 一覧へ。そのあと useChildData().refresh()。
// 「キャンセル」「←」→ 子10 一覧へ。
import { router, useLocalSearchParams } from "expo-router";
import { fallbackFrom, PeriodEditor, usePeriods } from "@/components/schedule";
import { useChildData } from "@/lib/child-data";
import { useFlow } from "@/lib/flow";

export default function ChildScheduleEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { childId, config, refresh } = useChildData();
  const { editTest, setEditTest } = useFlow();
  const snapshot = config && config.status !== "unavailable" ? config.snapshot : null;
  const { state, reload } = usePeriods("test", childId, fallbackFrom(snapshot, "test"));

  const toList = () => {
    setEditTest(null);
    router.navigate("/child/schedule-list");
  };

  return (
    <PeriodEditor
      // タブの中の画面は閉じても残るので、別の1件を開いたら入力を作り直す
      key={id}
      kind="test"
      viewer="child"
      childId={childId}
      mode={{ type: "edit", id: id ?? "", known: editTest }}
      periods={state}
      reload={reload}
      onBack={toList}
      onCancel={toList}
      onDone={toList}
      onMissing={toList}
      afterChange={() => void refresh()}
    />
  );
}
