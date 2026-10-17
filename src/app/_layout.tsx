// アプリ全体の枠。テーマカラー（theme）・ログイン状態（session）・画面間の受け渡し（flow）を包み、画面の切り替え（Stack）を置く。
// 上のバーは各画面の <Screen> が描くので、Stack の見出しは出さない。
// テーマ（白色・黒色）は一番外の ThemeProvider が持つ（src/lib/theme.tsx）。ステータスバーの文字の色と画面の地の色もテーマに合わせる。
// 画面の道筋（ファイルの位置 = 道筋）:
//   /            入口（ログイン状態と役割で振り分ける）
//   /login       ログイン（子08・子09）
//   /pair/...    QR の紐づけ（子13〜子19・親10〜親15・共01〜共03）
//   /child/...   子ども用（下部タブ5つ。child/_layout.tsx）
//   /parent/...  保護者用（下部タブ4つ。parent/_layout.tsx）
import { ThemeProvider as NavigationThemeProvider, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FlowProvider } from "@/lib/flow";
import { SessionProvider } from "@/lib/session";
import { navigationTheme, ThemeProvider, useTheme } from "@/lib/theme";
import { statusBarStyle } from "@/lib/theme-store";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <FlowProvider>
            <ThemedStack />
          </FlowProvider>
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
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
