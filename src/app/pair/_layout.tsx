// QR の紐づけの画面のまとまり（下部タブなし。Figma の QR・連携の画面はタブがない）。
// ログインしていなければ入口へ戻す。役割が決まった人も来られる（保護者が2人目の子どもを足す・子どもが QR を出し直す）。
import { Redirect, Stack } from "expo-router";
import { useSession } from "@/lib/session";

export default function PairLayout() {
  const { state } = useSession();
  if (state.status === "signedOut") return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
