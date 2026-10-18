// tmp/animations/rnweb/whiteboard/components/schedule/DeletePeriodDialog.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 削除の確認のダイアログ（MVP_SPEC 5.1「削除確認」）。props はアプリの DeletePeriodDialog と同じ。
// 形（Figma 子20）: 上に warning、題名「「数学」を削除しますか？」、本文、線だけの丸いボタン2つを同じ幅で横に（左「キャンセル」・右「削除する」）。
//   「削除する」には delete のアイコンを付ける（Figma 子20。何をするボタンかを形でも分かるように）。赤は使わない（danger は道具の ink のまま）。
//   ボタンの並べ方（2つなら同じ幅で横に）は Dialog が決める。
// 「削除する」を押してもすぐ閉じない。サーバの確定を待つ間は busy で押せなくし、結果は呼んだ側が出す（アプリと同じ）。
import { Button, Dialog } from "@/kids/components";
import { deleteConfirmText, type Period, type PeriodKind } from "./logic";

type Props = {
  kind: PeriodKind;
  period: Period | null; // null なら閉じている
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeletePeriodDialog({ kind, period, busy, onCancel, onConfirm }: Props) {
  const text = period ? deleteConfirmText(kind, period) : { title: "", body: "" };
  return (
    <Dialog
      visible={period != null}
      icon="warning"
      iconTone="danger"
      title={text.title}
      body={text.body}
      onClose={busy ? () => undefined : onCancel}
      centered
      actions={
        <>
          <Button variant="pill" label="キャンセル" onPress={onCancel} disabled={busy} />
          <Button variant="pill" label="削除する" icon="delete" onPress={onConfirm} loading={busy} danger />
        </>
      }
    />
  );
}
