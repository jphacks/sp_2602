// 日程（テスト期間・空白期間）の部品の入口。子どもの画面（子03・子05・子10）と保護者の画面（親05・空白期間）で使い回す。
//   画面の判断（検査・並べ方・文言・失敗の出し分け）は logic.ts の純粋な関数（tests/schedule/ でテスト）。

export { deletePeriod, fallbackFrom, fetchPeriods, savePeriod } from "./actions";
export { DeletePeriodDialog } from "./DeletePeriodDialog";
export { asTestPeriod } from "./logic";
export { ParentChildGate } from "./ParentChildGate";
export { type EditorMode, PeriodEditor } from "./PeriodEditor";
export { PeriodForm } from "./PeriodForm";
export { PeriodListScreen } from "./PeriodListScreen";
export { PeriodManager } from "./PeriodManager";
export { PeriodRow } from "./PeriodRow";
export { usePeriods } from "./usePeriods";
