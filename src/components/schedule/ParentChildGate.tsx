// 保護者の日程の画面（親05・空白期間）で、見ている子どもが決まるまでの状態を出す。決まったら children(childId) を出す。
//   家族の一覧の読み込み中 → 読み込み中 / 取れない → 取得不可（もう一度ためす）/ 連携している子どもがいない → その旨と QR の読み取りへ
// 取れない値を 0件と出さないため、子どもが決まるまでは一覧を出さない。出し分けは components/parent/gate.ts の familyGate。
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Screen, StateView } from "@/components";
import { familyGate, scanQrAction } from "@/components/parent/gate";
import { useParentData } from "@/lib/parent-data";

type Props = { title: string; onBack: () => void; children: (childId: string) => ReactNode };

export function ParentChildGate({ title, onBack, children }: Props) {
  const { child, family, familyError, refresh } = useParentData();
  const gate = familyGate(child, family, familyError);
  if (gate.kind === "child") return <>{children(gate.child.id)}</>;
  return (
    <Screen title={title} onBack={onBack} bottomInset={false}>
      {gate.kind === "unlinked" ? (
        <StateView
          state="empty"
          message="連携しているお子さんがいません"
          hint="お子さんの端末と連携すると、日程を登録できます"
          action={{ label: scanQrAction.label, onPress: () => router.navigate(scanQrAction.href) }}
        />
      ) : (
        <StateView
          state={gate.kind}
          error={gate.kind === "unknown" ? gate.error : null}
          onRetry={() => void refresh()}
        />
      )}
    </Screen>
  );
}
