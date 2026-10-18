// 日程の見た目の部品の振り分け（決まりは ../kids-switch.tsx と同じ）。子どもの画面（子03・子05・子10）で使う。
// 画面は今までどおり `import { PeriodEditor } from "@/components/schedule";`（schedule/index.ts がここを出す）。
// 保護者の画面は PeriodManager の中で今の部品（./PeriodEditor など）を直接読むので、今の見た目のまま。
// なぜ ../kids-switch.tsx に置かないか: 今の部品（./PeriodEditor など）は中で "@/components"（../index.ts）を読む。
//   ../index.ts が読む ../kids-switch.tsx がここの部品まで読むと、import の輪（../index.ts → ../kids-switch.tsx →
//   ./PeriodEditor → ../index.ts）になり、読み込みの途中で部品が空のまま使われることがある。ここなら ../index.ts は読まない。
// 新しい部品は入口（@/kids/components/schedule の index.ts）でなく、1つずつのファイルから読む
//   （入口はアプリの PeriodManager・ParentChildGate も出していて、それが "@/components" を読むので輪になる）。
import type { ComponentProps } from "react";
import { DeletePeriodDialog as KidsDeletePeriodDialog } from "@/kids/components/schedule/DeletePeriodDialog";
import { PeriodEditor as KidsPeriodEditor } from "@/kids/components/schedule/PeriodEditor";
import { PeriodForm as KidsPeriodForm } from "@/kids/components/schedule/PeriodForm";
import { PeriodListScreen as KidsPeriodListScreen } from "@/kids/components/schedule/PeriodListScreen";
import { PeriodRow as KidsPeriodRow } from "@/kids/components/schedule/PeriodRow";
import { useKidsUI } from "@/kids/KidsUI";
import { DeletePeriodDialog as ClassicDeletePeriodDialog } from "./DeletePeriodDialog";
import { PeriodEditor as ClassicPeriodEditor } from "./PeriodEditor";
import { PeriodForm as ClassicPeriodForm } from "./PeriodForm";
import { PeriodListScreen as ClassicPeriodListScreen } from "./PeriodListScreen";
import { PeriodRow as ClassicPeriodRow } from "./PeriodRow";

export function DeletePeriodDialog(p: ComponentProps<typeof ClassicDeletePeriodDialog>) {
  return useKidsUI() ? <KidsDeletePeriodDialog {...p} /> : <ClassicDeletePeriodDialog {...p} />;
}
export function PeriodEditor(p: ComponentProps<typeof ClassicPeriodEditor>) {
  return useKidsUI() ? <KidsPeriodEditor {...p} /> : <ClassicPeriodEditor {...p} />;
}
export function PeriodForm(p: ComponentProps<typeof ClassicPeriodForm>) {
  return useKidsUI() ? <KidsPeriodForm {...p} /> : <ClassicPeriodForm {...p} />;
}
export function PeriodListScreen(p: ComponentProps<typeof ClassicPeriodListScreen>) {
  return useKidsUI() ? <KidsPeriodListScreen {...p} /> : <ClassicPeriodListScreen {...p} />;
}
export function PeriodRow(p: ComponentProps<typeof ClassicPeriodRow>) {
  return useKidsUI() ? <KidsPeriodRow {...p} /> : <ClassicPeriodRow {...p} />;
}
