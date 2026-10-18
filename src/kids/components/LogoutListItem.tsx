// tmp/animations/rnweb/whiteboard/components/LogoutListItem.tsx から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 設定画面の「ログアウト」の項目と、確認のダイアログ（ホワイトボード・Figma 子07・子07-B）。動きはアプリの LogoutListItem と同じ。
// 押す → 確認 → useSession().signOut() → 入口へ戻る。見た目はこのフォルダの ListItem・Dialog・Button（線だけの丸いボタンが2つ横に並ぶ）。
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
          // Figma 子07-B: 線だけの丸いボタンが2つ横に並ぶ（どちらも同じ見た目）
          <>
            <Button variant="pill" label="キャンセル" onPress={() => setOpen(false)} disabled={busy} />
            <Button variant="pill" label="ログアウト" onPress={logout} loading={busy} />
          </>
        }
      />
    </>
  );
}
