// tmp/animations/rnweb/whiteboard/components/schedule/index.ts から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 日程（テスト期間・空白期間）の部品の入口（ホワイトボードの確認ページ）。アプリの src/components/schedule/index.ts と同じ名前を全部出す。
// 見た目を変えた部品（PeriodRow・PeriodListScreen・PeriodEditor・PeriodForm・DeletePeriodDialog）はこのフォルダのもの。
// 計算・通信（logic・actions・usePeriods）と、見た目を持たない保護者の部品（ParentChildGate・PeriodManager）はアプリのものをそのまま出す。
//   PeriodManager はアプリの中で "./PeriodEditor" を読むので、確認ページでは保護者の画面だけ前の見た目になる（子どもの画面は使わない）。
//   アプリに入れるときは、このフォルダの *.tsx を src/components/schedule/ に入れ替えるだけでよい（index.ts は今のアプリのままでよい）。

export { ParentChildGate } from "@/components/schedule/ParentChildGate";
export { PeriodManager } from "@/components/schedule/PeriodManager";
export { deletePeriod, fallbackFrom, fetchPeriods, savePeriod } from "./actions";
export { DeletePeriodDialog } from "./DeletePeriodDialog";
export { asTestPeriod } from "./logic";
export { type EditorMode, PeriodEditor } from "./PeriodEditor";
export { PeriodForm } from "./PeriodForm";
export { PeriodListScreen } from "./PeriodListScreen";
export { PeriodRow } from "./PeriodRow";
export { usePeriods } from "./usePeriods";
