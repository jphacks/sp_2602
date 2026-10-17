// 子ども側の QR の紐づけ（Figma 子13 QR発行中 108:8926・子14 QR表示 108:8943・子15 QR期限切れ 108:8963・
// 子16 QR発行失敗 108:8978・子17 連携結果の確認中 108:8993・子18 家族に入りますか？確認 108:9006・子19 連携完了 108:9037）。
// 仮の画面（見出しだけ）。次の担当が作る。
// この画面で作るもの:
//   1. 開いたら call("pairStart", {}) → 子13（発行中: MessageView spinner）→ 成功で子14、失敗で子16（再発行・やめる）
//   2. 子14: react-native-qrcode-svg で ticket.code を QR にする（QR には code だけ。合言葉を入れない）。
//      残り時間（expiresAt まで。Chip icon="clock"「あと 9分41秒で使えなくなります」）を1秒ごとに数える
//   3. 待っている間は usePolling で数秒ごとに call("pairStatus", { pairId })。
//      claimed になったら子18 のダイアログ（「{parentName}さんの家族に入りますか？」はい / いいえ）→ call("pairConfirm", { pairId, accept })
//      expired → 子15（出し直す・やめる）。rejected → 入口へ
//   4. pairConfirm の応答が届かなかった（network）ときは子17（確認中）→ pairStatus で取り直す（共02「連携結果が未確定」）
//   5. linked（子19）→ 「はじめる」で useSession().refresh() → router.replace("/")（役割が child になり /child/home へ進む）
//   ・やめる（キャンセル）は未連携のまま入口へ戻る
import { router } from "expo-router";
import { AppText, Button, Screen } from "@/components";

export default function PairChild() {
  return (
    <Screen title="QR コードを出す" onBack={() => router.back()}>
      <AppText tone="muted">この画面はこれから作ります（子13〜子19）。</AppText>
      <Button variant="outline" label="もどる" onPress={() => router.back()} />
    </Screen>
  );
}
