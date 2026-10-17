// アプリ全体の枠。ログイン状態（session）と画面間の受け渡し（flow）を包み、画面の切り替え（Stack）を置く。
// 上のバーは各画面の <Screen> が描くので、Stack の見出しは出さない。
// 画面の道筋（ファイルの位置 = 道筋）:
//   /            入口（ログイン状態と役割で振り分ける）
//   /login       ログイン（子08・子09）
//   /pair/...    QR の紐づけ（子13〜子19・親10〜親15・共01〜共03）
//   /child/...   子ども用（下部タブ5つ。child/_layout.tsx）
//   /parent/...  保護者用（下部タブ4つ。parent/_layout.tsx）
import { tokens } from "@contracts/tokens";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FlowProvider } from "@/lib/flow";
import { SessionProvider } from "@/lib/session";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <FlowProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tokens.color.bg } }} />
        </FlowProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
