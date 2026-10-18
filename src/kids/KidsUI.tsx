// 子ども用の見た目（Figma「UI子供用」の3つのテーマ）の入口。手で書いたもの（写したものではない）。
//   KidsUIProvider : 中の画面を子ども用の見た目にする。色の組を子ども用に替え（src/lib/theme.tsx の ThemeLook）、
//                    部品の振り分け（src/components/kids-switch.tsx など）が新しい部品を選ぶようにする。
//   useKidsUI()    : 今、子ども用の見た目の中か（部品の振り分けが使う）
//   withKidsUI(C)  : 画面（expo-router の default export）を KidsUIProvider で包む
// 保護者の画面は包まない（保護者は別のデザインにする予定。今の見た目のまま）。
//
// テーマの名前のつなぎ（写した部品の中の名前 whiteboard・chalkboard・notebook ↔ アプリが保存する名前 light・dark・notebook）は theme-names.ts。
// 部品の中の useTheme().name は、保存している名前（light・dark・notebook）のまま渡す（選択肢・色見本・道具の決め方はその名前で引ける。
// src/kids/tools/index.tsx の toolNameForTheme・src/kids/theme/tool.ts の themeSwatch・src/kids/lib/theme-store.ts）。
import { ThemeProvider as NavigationThemeProvider } from "expo-router";
import { type ComponentType, createContext, type ReactNode, useContext, useMemo } from "react";
import { navigationTheme, ThemeLook, useSavedThemeName } from "@/lib/theme";
import { kidsPalettes } from "./theme/themes";
import { kidsThemeOf } from "./theme-names";

const KidsUIContext = createContext(false);

export function KidsUIProvider({ children }: { children: ReactNode }) {
  const saved = useSavedThemeName();
  const colors = kidsPalettes[kidsThemeOf(saved)];
  // 画面の切り替え（Tabs・Stack）の地も子ども用の色にする（切り替えの途中に保護者の見た目の地が見えないように）
  const navTheme = useMemo(() => navigationTheme(saved, colors), [saved, colors]);
  return (
    <KidsUIContext.Provider value={true}>
      <ThemeLook look="kids" name={saved} colors={colors}>
        <NavigationThemeProvider value={navTheme}>{children}</NavigationThemeProvider>
      </ThemeLook>
    </KidsUIContext.Provider>
  );
}

export function useKidsUI(): boolean {
  return useContext(KidsUIContext);
}

// 画面を子ども用の見た目で包む（export default withKidsUI(Login) のように使う）
export function withKidsUI<P extends object>(Screen: ComponentType<P>): ComponentType<P> {
  function KidsScreen(props: P) {
    return (
      <KidsUIProvider>
        <Screen {...props} />
      </KidsUIProvider>
    );
  }
  KidsScreen.displayName = `withKidsUI(${Screen.displayName ?? Screen.name ?? "Screen"})`;
  return KidsScreen;
}
