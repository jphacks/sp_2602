// 保護者の日程の画面（親05・空白期間）で、見ている子どもが決まるまでの状態を出す。決まったら children(childId) を出す。
//   家族の一覧の読み込み中 → 読み込み中 / 取れない → 取得不可（もう一度ためす）/ 連携している子どもがいない → その旨
// 取れない値を 0件と出さないため、子どもが決まるまでは一覧を出さない。
import type { ReactNode } from "react";
import { Screen, StateView } from "@/components";
import { useParentData } from "@/lib/parent-data";

type Props = { title: string; onBack: () => void; children: (childId: string) => ReactNode };

export function ParentChildGate({ title, onBack, children }: Props) {
  const { child, family, familyError, refresh } = useParentData();
  if (child) return <>{children(child.id)}</>;
  const state = family == null ? (familyError ? "unknown" : "loading") : family.length === 0 ? "empty" : "loading";
  return (
    <Screen title={title} onBack={onBack} bottomInset={false}>
      <StateView
        state={state}
        error={familyError}
        message={state === "empty" ? "連携しているお子さんがいません" : undefined}
        hint={state === "empty" ? "お子さんの端末と連携すると、日程を登録できます" : undefined}
        onRetry={() => void refresh()}
      />
    </Screen>
  );
}
