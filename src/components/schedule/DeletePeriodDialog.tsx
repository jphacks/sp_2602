// 削除の確認のダイアログ（MVP_SPEC 5.1「削除確認」。Figma にはないので、親07 のログアウト確認と同じ「文字のボタン2つ」の形）。
// 「削除する」を押してもすぐ閉じない。サーバの確定を待つ間は busy で押せなくし、結果は呼んだ側が出す。
import { Button, Dialog } from "@/components";
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
      actions={
        <>
          <Button variant="text" label="キャンセル" onPress={onCancel} disabled={busy} />
          <Button variant="text" label="削除する" onPress={onConfirm} loading={busy} danger />
        </>
      }
    />
  );
}
