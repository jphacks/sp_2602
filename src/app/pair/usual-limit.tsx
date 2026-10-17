// 紐づけ直後に保護者が1日の上限（通常上限）を決める画面（Q7。Figma にない。下部タブなし。Q12）。仮の画面（見出しだけ）。次の担当が作る。
// 親15「連携完了」の次に来る。あとから親02（計画）でも変えられる。
// この画面で作るもの:
//   - 説明（テストや計画がない日は、この時間までにする）・TextField「1日の上限（分）」（0〜1440 の整数）
//   - 「決める」: call("usualLimitSave", { childId, expectedVersion, usualLimitMinutes })（childId は familyGet の1人目。
//     expectedVersion は planGet の configVersion）。確定を待ってから router.replace("/")（親01 へ）
//   - 決めないで進んだときは、子どもの画面は「上限未設定」（0 分とも制限なしとも違う）になる
import { router } from "expo-router";
import { AppText, Button, Screen } from "@/components";

export default function PairUsualLimit() {
  return (
    <Screen
      title="1日の上限を決める"
      footer={<Button label="あとで決める" variant="outline" onPress={() => router.replace("/")} />}
    >
      <AppText tone="muted">紐づけ直後の通常上限の設定（これから作ります）</AppText>
    </Screen>
  );
}
