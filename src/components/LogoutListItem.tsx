// 設定画面の「ログアウト」の項目と、確認のダイアログ（Figma 親07 ログアウト確認ポップアップ）。保護者の設定（親04）だけで使う。
// Figma 子07 にもあるが、子どもの設定には出さない（D-136。子どもがログアウトすると制限が止まるため。useSession().signOut も子どもでは何もしない）。
// 押す → 確認 → useSession().signOut()（端末の合言葉を消す）→ 入口へ戻る（入口がログイン画面へ振り分ける）。
//   <LogoutListItem />
import { router } from "expo-router";
import { useState } from "react";
import { useSession } from "@/lib/session";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { ListItem } from "./ListItem";

export function LogoutListItem() {
  const { signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    try {
      await signOut();
      setOpen(false);
      router.replace("/");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <ListItem icon="logout" title="ログアウト" strong chevron={false} onPress={() => setOpen(true)} />
      <Dialog
        visible={open}
        title="ログアウトしますか？"
        body="ログアウトすると、もう一度ログインが必要です。"
        centered
        onClose={() => setOpen(false)}
        actions={
          // Figma 親07: 枠付きの丸いボタンが2つ横に並ぶ（どちらも同じ見た目）
          <>
            <Button variant="pill" label="キャンセル" onPress={() => setOpen(false)} disabled={busy} />
            <Button variant="pill" label="ログアウト" onPress={logout} loading={busy} />
          </>
        }
      />
    </>
  );
}
