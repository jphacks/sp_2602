// アプリ全体の枠。テーマカラー（theme）・ログイン状態（session）・画面間の受け渡し（flow）を包み、画面の切り替え（Stack）を置く。
// 上のバーは各画面の <Screen> が描くので、Stack の見出しは出さない。
// テーマ（白色・黒色・ベージュ）は一番外の ThemeProvider が持つ（src/lib/theme.tsx）。ステータスバーの文字の色と画面の地の色もテーマに合わせる。
// 子ども用の見た目（src/kids）の書体は、ここで一番はじめに読み込む（src/kids/font-files.ts）。読み終わるまでは何も描かない
// （テーマの読み込みと同じく、書体が後から替わって文字の幅が揺れるのを見せない）。読み込めなかったときは端末の既定の書体で描く。
// 画面の道筋（ファイルの位置 = 道筋）:
//   /            入口（ログイン状態と役割で振り分ける）
//   /login       ログイン（子08・子09）
//   /pair/...    QR の紐づけ（子13〜子19・親10〜親15・共01〜共03）
//   /child/...   子ども用（下部タブ5つ。child/_layout.tsx）
//   /parent/...  保護者用（下部タブ4つ。parent/_layout.tsx）
import { ThemeProvider as NavigationThemeProvider, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { type ReactNode, useMemo } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useKidsFonts } from "@/kids/font-files";
import { FlowProvider } from "@/lib/flow";
import { SessionProvider, useSession } from "@/lib/session";
import { navigationTheme, ThemeProvider, useTheme } from "@/lib/theme";
import { statusBarStyle } from "@/lib/theme-store";

export default function RootLayout() {
  const fontsReady = useKidsFonts();
  if (!fontsReady) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <SessionFlow>
            <ThemedStack />
          </SessionFlow>
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// 画面の間の受け渡し（flow）を、ログインしている人ごとにする（ログアウト・401・別の人のログインで、見ていた子どもを持ち越さない）
function SessionFlow({ children }: { children: ReactNode }) {
  const { state } = useSession();
  return <FlowProvider owner={state.status === "signedIn" ? state.session.userId : null}>{children}</FlowProvider>;
}

function ThemedStack() {
  const { name, colors } = useTheme();
  const navTheme = useMemo(() => navigationTheme(name), [name]);
  const screenOptions = useMemo(() => ({ headerShown: false, contentStyle: { backgroundColor: colors.bg } }), [colors]);
  return (
    <NavigationThemeProvider value={navTheme}>
      <StatusBar style={statusBarStyle(name)} />
      <Stack screenOptions={screenOptions} />
    </NavigationThemeProvider>
  );
}
