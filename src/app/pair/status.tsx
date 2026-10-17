// 連携状態を確かめる画面（Figma 共01 連携状態を取得できない 108:9143・共02 連携結果が未確定 108:9156・共03 連携未完了 108:9171）。
// 仮の画面（見出しだけ）。次の担当が作る。
// この画面で作るもの:
//   - call("linkStatus") で D2 の連携状態を取り直す。通信できない → 共01（「未連携」と決めつけず、再確認のボタン）
//   - linked → useSession().refresh() → router.replace("/")。unlinked → 共03（もう一度 QR から・やめる）
//   - pair/child・pair/parent の途中で結果が分からなくなったとき（共02）にもここへ来てよい
import { router } from "expo-router";
import { AppText, Button, Screen } from "@/components";

export default function PairStatus() {
  return (
    <Screen title="連携状態の確認" onBack={() => router.back()}>
      <AppText tone="muted">この画面はこれから作ります（共01〜共03）。</AppText>
      <Button variant="outline" label="もどる" onPress={() => router.back()} />
    </Screen>
  );
}
