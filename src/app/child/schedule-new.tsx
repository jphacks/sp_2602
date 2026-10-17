// 子03 テスト日程登録（Figma 108:6809）＋ 子04 登録完了ポップアップ（108:6843）。子どものタブ「日程登録」。
// データ: 今の版と登録済みのテスト期間は testPeriodList（取れなければ C7 の設定の組 useChildData().config を「古い」として使う）。
// 入力: テスト名・開始日・終了日（Figma は日付1つだが MVP_SPEC 5.1 で期間に拡張）。重なり・終了日 < 開始日・空の名前は送る前に止める。
// 保存: testPeriodCreate（expectedVersion つき）。サーバが保存と C10 の再計算を終えて返したら子04「登録しました。」→ OK でホームへ。
//       そのあと useChildData().refresh() で設定の組（C7）を取り直す。子どももテスト期間を追加できる（Q11）。
// 「キャンセル」→ 入力を消してホームへ。
import { router } from "expo-router";
import { fallbackFrom, PeriodEditor, usePeriods } from "@/components/schedule";
import { useChildData } from "@/lib/child-data";

export default function ChildScheduleNew() {
  const { childId, config, refresh } = useChildData();
  const snapshot = config && config.status !== "unavailable" ? config.snapshot : null;
  const { state, reload } = usePeriods("test", childId, fallbackFrom(snapshot, "test"));
  const home = () => router.navigate("/child/home");

  return (
    <PeriodEditor
      kind="test"
      viewer="child"
      childId={childId}
      mode={{ type: "create" }}
      periods={state}
      reload={reload}
      onCancel={home}
      onDone={home}
      onMissing={home}
      afterChange={() => void refresh()}
    />
  );
}
