// 子10 テスト日程の一覧・変更（Figma 108:7005）。子どものタブ「日程一覧」。
// データ: testPeriodList（画面が出ている間は30秒ごとに取り直す。取れなければ C7 の設定の組 useChildData().config を「古い」として出す）。
// 並べ方: 近い順（期間中・これから → 終わったテスト）。0件は「予定のテストはありません」。取得不可は 0件と出さず「もう一度ためす」。
// 行き先: 項目 → flow の setEditTest で渡して 子05（/child/schedule-edit/{id}）。「＋ テストを追加する」→ 子03（/child/schedule-new）。
//         「←」→ 前の画面（なければ 子07 設定。Figma の推測）。子どももテスト期間を変えられる（Q11）。空白期間は保護者だけなのでここには出さない。
import { router } from "expo-router";
import { asTestPeriod, fallbackFrom, PeriodListScreen, usePeriods } from "@/components/schedule";
import { useChildData } from "@/lib/child-data";
import { useFlow } from "@/lib/flow";

export default function ChildScheduleList() {
  const { childId, today, config } = useChildData();
  const { setEditTest } = useFlow();
  const snapshot = config && config.status !== "unavailable" ? config.snapshot : null;
  const { state, reload } = usePeriods("test", childId, fallbackFrom(snapshot, "test"));

  return (
    <PeriodListScreen
      kind="test"
      viewer="child"
      today={today}
      periods={state}
      reload={() => void reload()}
      onBack={() => (router.canGoBack() ? router.back() : router.navigate("/child/settings"))}
      onAdd={() => router.navigate("/child/schedule-new")}
      onOpen={(p) => {
        // 編集画面にすぐ出すため、押した1件を渡す（編集画面は id で取り直しもする）
        setEditTest(asTestPeriod(p));
        router.push(`/child/schedule-edit/${p.id}`);
      }}
    />
  );
}
