// 入口。ログイン状態（session.tsx）と役割で、行き先を振り分ける（FigJam 親用・子供用フローの「起動 → C1 → D2 連携確認」）。
//   確かめ中        → 読み込み中の表示
//   ログインしていない → /login
//   役割なし（紐づけ前）→ /pair（QR の紐づけ）
//   子ども          → /child/home
//   保護者          → /parent/home
// 役割は QR の紐づけ（D2 への保存）が確定したときにサーバが決める。役割があれば連携済み（共01 の「連携状態を取得できない」は
// 通信できないときに起こるが、そのときは保存してある Session で進む = session.tsx の offline）。
import { Redirect } from "expo-router";
import { Screen, StateView } from "@/components";
import { withKidsUI } from "@/kids/KidsUI";
import { useSession } from "@/lib/session";

function Index() {
  const { state } = useSession();
  if (state.status === "checking")
    return (
      <Screen title="Slope">
        <StateView state="loading" message="ログインを確かめています…" />
      </Screen>
    );
  if (state.status === "signedOut") return <Redirect href="/login" />;
  const { role } = state.session;
  if (role === "child") return <Redirect href="/child/home" />;
  if (role === "parent") return <Redirect href="/parent/home" />;
  return <Redirect href="/pair" />;
}

// 親子どちらにも出る入口の画面。Figma の子ども用のデザイン（入01・入02・子08・子09・共01〜共03 など）があるので、今は子ども用の見た目（src/kids）で描く。
export default withKidsUI(Index);
