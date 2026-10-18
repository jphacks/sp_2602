// 日程（テスト期間・空白期間）の部品の入口。子どもの画面（子03・子05・子10）と保護者の画面（親05・空白期間）で使い回す。
//   画面の判断（検査・並べ方・文言・失敗の出し分け）は logic.ts の純粋な関数（tests/schedule/ でテスト）。
//   見た目の部品は ./kids-switch.tsx を通す（子どもの画面は新しい部品）。PeriodManager（保護者）は中で今の部品を直接読むので今の見た目のまま。

export { deletePeriod, fallbackFrom, fetchPeriods, savePeriod } from "./actions";
export { DeletePeriodDialog, PeriodEditor, PeriodForm, PeriodListScreen, PeriodRow } from "./kids-switch";
export { asTestPeriod } from "./logic";
export { ParentChildGate } from "./ParentChildGate";
export type { EditorMode } from "./PeriodEditor";
export { PeriodManager } from "./PeriodManager";
export { usePeriods } from "./usePeriods";
