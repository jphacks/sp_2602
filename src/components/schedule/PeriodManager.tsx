// 保護者の日程の管理（親05 テスト日程・空白期間）。一覧と、追加・変更の入力を1つの画面の中で切り替える。
// なぜ1画面で切り替えるか: Figma に親用の登録・変更の画面がなく（screens-text.md 6章の 9）、子どもの画面（子03・子05）と同じ入力を
// 親のタブ（設定が選択中）のまま出したいため。入力中は Android の戻るボタンで一覧に戻る（画面からは出ない）。
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { BackHandler } from "react-native";
import type { Period, PeriodKind, PeriodSource } from "./logic";
import { PeriodEditor } from "./PeriodEditor";
import { PeriodListScreen } from "./PeriodListScreen";
import { usePeriods } from "./usePeriods";

type Mode = { type: "list" } | { type: "create" } | { type: "edit"; period: Period };

type Props = {
  kind: PeriodKind;
  childId: string;
  today: string;
  fallback: PeriodSource | null; // 一覧が取れないときに出す C7 の設定の組
  afterChange: () => void; // 保存・削除が確定したあと（useParentData().refresh()）
  onExit: () => void; // 一覧の「←」
};

export function PeriodManager({ kind, childId, today, fallback, afterChange, onExit }: Props) {
  const { state, reload } = usePeriods(kind, childId, fallback);
  const [mode, setMode] = useState<Mode>({ type: "list" });
  const toList = useCallback(() => setMode({ type: "list" }), []);

  // 入力中の Android の戻るボタンは、一覧に戻すだけにする
  useFocusEffect(
    useCallback(() => {
      if (mode.type === "list") return undefined;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        toList();
        return true;
      });
      return () => sub.remove();
    }, [mode.type, toList]),
  );

  if (mode.type === "list")
    return (
      <PeriodListScreen
        kind={kind}
        viewer="parent"
        today={today}
        periods={state}
        reload={() => void reload()}
        onBack={onExit}
        onAdd={() => setMode({ type: "create" })}
        onOpen={(period) => setMode({ type: "edit", period })}
      />
    );

  return (
    <PeriodEditor
      // 別の1件を開いたら入力を作り直す
      key={mode.type === "edit" ? mode.period.id : "create"}
      kind={kind}
      viewer="parent"
      childId={childId}
      mode={mode.type === "edit" ? { type: "edit", id: mode.period.id, known: mode.period } : { type: "create" }}
      periods={state}
      reload={reload}
      onBack={toList}
      onCancel={toList}
      onDone={toList}
      onMissing={toList}
      afterChange={afterChange}
    />
  );
}
