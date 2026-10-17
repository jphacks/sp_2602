// 連携状態の3つの全面表示（Figma 共01 108:9143・共02 108:9156・共03 108:9171）。
// pair/index.tsx（役割選びの前の照会）・pair/status.tsx・pair/child.tsx・pair/parent.tsx で同じ見た目を使うため部品にした。
// どれも「未連携」と決めつけない言い方にする（MVP_SPEC 4.1: 成功／失敗／不明を区別）。
import { AppText, Button, MessageView } from "@/components";

type Detail = { detail?: string | null }; // 何が起きたか（サーバ・通信の文）を小さく添える

function DetailText({ detail }: Detail) {
  if (!detail) return null;
  return (
    <AppText variant="caption" tone="muted" center>
      {detail}
    </AppText>
  );
}

// 共01 連携状態を取得できない（QR の画面には進まず、もう一度確かめる）
export function LinkUnknown({ onRetry, busy, detail }: Detail & { onRetry: () => void; busy?: boolean }) {
  return (
    <MessageView
      icon="cloud_off"
      title="つながりの状態を確かめられません"
      body={"QRコードの画面には進まず、もう一度確かめます。\n通信を確かめてください。"}
      actions={<Button label="もう一度確かめる" onPress={onRetry} loading={busy} />}
    >
      <DetailText detail={detail} />
    </MessageView>
  );
}

// 共02 連携結果が未確定（通信が切れて、つながったかどうか分からない）
export function LinkUnsure({
  onCheck,
  onLater,
  busy,
  detail,
}: Detail & { onCheck: () => void; onLater: () => void; busy?: boolean }) {
  return (
    <MessageView
      icon="sync"
      title="結果がまだ分かりません"
      body={"通信が切れました。\nあとで、もう一度つながりの状態を確かめましょう。"}
      actions={
        <>
          <Button label="状態を確かめる" onPress={onCheck} loading={busy} />
          <Button variant="outline" label="あとで" onPress={onLater} disabled={busy} />
        </>
      }
    >
      <DetailText detail={detail} />
    </MessageView>
  );
}

// 共03 連携未完了（D2 に保存されていない。もう一度はじめられる）
export function LinkIncomplete({
  onRestart,
  onLater,
  detail,
}: Detail & { onRestart: () => void; onLater: () => void }) {
  return (
    <MessageView
      icon="info"
      title="まだつながっていません"
      body={"QRコードでのつながりが終わっていません。\nもう一度はじめることができます。"}
      actions={
        <>
          <Button label="もう一度はじめる" onPress={onRestart} />
          <Button variant="outline" label="あとで" onPress={onLater} />
        </>
      }
    >
      <DetailText detail={detail} />
    </MessageView>
  );
}
