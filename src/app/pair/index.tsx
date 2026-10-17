// 役割を選ぶ画面（Q1。ログイン後、役割がまだない人が来る。Figma にない画面・下部タブなし。Q12）。
// この端末を子どもの端末にするか、保護者の端末にするかを選ぶ。サーバ上の役割は QR の紐づけ（linked）で確定する。
// 仮の画面: 2つのボタンで子ども側（/pair/child）・保護者側（/pair/parent）へ進める。ログアウトもできる。
// この画面で作るもの:
//   - 「子どもの端末として QR を出す」「保護者として QR を読み取る」の2つ（主ボタンは1つにする工夫を）
//   - 役割は QR の紐づけが確定したときに決まる（QR を出した人 = 子ども、読んだ人 = 保護者）ことの説明
import { router } from "expo-router";
import { AppText, Button, Screen } from "@/components";
import { useSession } from "@/lib/session";

export default function PairStart() {
  const { signOut } = useSession();
  return (
    <Screen
      title="家族と連携する"
      footer={
        <>
          <Button label="子どもの端末として QR を出す" icon="group" onPress={() => router.push("/pair/child")} />
          <Button variant="outline" label="保護者として QR を読み取る" onPress={() => router.push("/pair/parent")} />
          <Button
            variant="text"
            label="ログアウト"
            onPress={async () => {
              await signOut();
              router.replace("/");
            }}
          />
        </>
      }
    >
      <AppText>子どもの端末で QR コードを出し、保護者の端末で読み取ると、家族として連携できます。</AppText>
    </Screen>
  );
}
