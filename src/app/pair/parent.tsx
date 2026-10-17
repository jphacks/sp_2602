// 保護者側の QR の読み取り（Figma 親10 カメラ権限の案内 108:9050・親11 QR読み取り中 108:9065・親12 QR検証中 108:9077・
// 親13 QR読み取り失敗 108:9092・親14 連携の保存失敗 108:9115・親15 連携完了 108:9130）。
// 仮の画面（見出しだけ）。次の担当が作る。
// この画面で作るもの:
//   1. expo-camera の useCameraPermissions で権限を確かめる。ない → 親10（許可する・やめる）。拒否されたら設定を開く案内
//   2. 親11: CameraView（barcodeScannerSettings: qr）＋ 240×240 の枠＋「子どものスマホに出ている QRコードを枠に入れてね」
//      1回読んだら読み取りを止める（同じ QR を何度も送らない）
//   3. 親12（確かめています…）: call("pairClaim", { code })。
//      失敗 → 親13（errorOf の message・hint。期限切れ・使用済み・不正・すでに連携済み（親1↔子1。Q2）は conflict / not_found）→ 読み直す・やめる
//      成功（claimed）→ 子どもの「はい」を待つ: usePolling で call("pairStatus", { pairId })
//   4. linked → 親15（連携完了）→ useSession().refresh() → flow の setChild(status.child) → /pair/usual-limit（通常上限を決める。Q7）
//      rejected・expired → 共03「連携未完了」。通信が切れて結果が分からない → 共02「連携結果が未確定」（pairStatus で取り直す）
//   ・保存の確定（linked）を見るまで成功を表示しない（MVP_SPEC 4.1）
import { router } from "expo-router";
import { AppText, Button, Screen } from "@/components";

export default function PairParent() {
  return (
    <Screen title="QR コードを読み取る" onBack={() => router.back()}>
      <AppText tone="muted">この画面はこれから作ります（親10〜親15）。</AppText>
      <Button variant="outline" label="もどる" onPress={() => router.back()} />
    </Screen>
  );
}
