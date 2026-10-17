// テーマカラー（ライト = 白色 / ダーク = 黒色）の切り替えの仕組み。
//   ThemeProvider : 今のテーマを持つ。起動時に端末の保存（theme-store.ts）から読み、読み終わるまでは何も描かない（白→黒のちらつきを出さない）。
//                   setTheme で切り替えると、保存して、すぐ全画面の色が変わる。既定はライト。ログアウトでは消さない。
//   useTheme()    : { name, colors, setTheme }。colors は今のテーマの色の組（contracts/tokens.ts の palettes）。
//   useColors()   : 今のテーマの色の組だけ。<Icon color={c.primary} /> のように、スタイル以外で色を渡すときに使う。
//   makeStyles()  : 色を使う StyleSheet をテーマごとに作る。
//
// 部品での使い方（色以外の余白・文字の大きさは今までどおり tokens のまま）:
//   const useStyles = makeStyles((c) =>
//     StyleSheet.create({ card: { backgroundColor: c.surface, borderColor: c.line, padding: tokens.layout.cardPadding } }),
//   );
//   export function Card() {
//     const styles = useStyles();
//     const c = useColors();
//     return <View style={styles.card}><Icon name="event" color={c.primary} /></View>;
//   }
//
// なぜこの方法か:
//   - StyleSheet.create をファイルの下にまとめて書く今の形をほぼそのまま残せる（tokens.color.x を c.x に変え、部品の中で useStyles() を呼ぶだけ）。
//     並び・余白の書き方は変わらないので、ほかの人の変更とぶつかりにくい。
//   - StyleSheet はテーマごとに1回だけ作って覚えておく（描くたびに作り直さない）。
//   - 色は React の context から読むので、切り替えた瞬間に開いている画面もダイアログも描き直される。
//     画面の木を作り直す（key を変える）方法だと、今いる画面から入口へ戻されてしまうので使わない。
//   - 色を使わない StyleSheet は今までどおり StyleSheet.create のままでよい。
import { type ColorPalette, palettes, type ThemeName } from "@contracts/tokens";
import { DarkTheme, DefaultTheme, type Theme } from "expo-router";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_THEME, loadThemeName, saveThemeName } from "./theme-store";

type ThemeValue = { name: ThemeName; colors: ColorPalette; setTheme: (name: ThemeName) => void };

const ThemeContext = createContext<ThemeValue>({
  name: DEFAULT_THEME,
  colors: palettes[DEFAULT_THEME],
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // null = まだ端末の保存を読んでいる
  const [name, setName] = useState<ThemeName | null>(null);

  useEffect(() => {
    let alive = true;
    loadThemeName().then((saved) => {
      // 読み終わる前に選び直していたら、そちらを優先する
      if (alive) setName((current) => current ?? saved);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setTheme = useCallback((next: ThemeName) => {
    setName(next);
    // 保存に失敗しても、今の表示は切り替える（次の起動で元に戻るだけ）
    saveThemeName(next).catch(() => {});
  }, []);

  const value = useMemo<ThemeValue | null>(
    () => (name ? { name, colors: palettes[name], setTheme } : null),
    [name, setTheme],
  );
  if (!value) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

export function useColors(): ColorPalette {
  return useContext(ThemeContext).colors;
}

// 色を使うスタイルの作り方。factory は色の組を受け取って StyleSheet を返す。テーマごとに1回だけ呼ぶ
export function makeStyles<T>(factory: (c: ColorPalette) => T): () => T {
  const cache = new Map<ThemeName, T>();
  return function useStyles(): T {
    const { name, colors } = useContext(ThemeContext);
    let styles = cache.get(name);
    if (styles === undefined) {
      styles = factory(colors);
      cache.set(name, styles);
    }
    return styles;
  };
}

// 画面の切り替え（expo-router の Stack・Tabs）の地の色。画面の裏や切り替えの途中に白が見えないよう、今のテーマの色を渡す
export function navigationTheme(name: ThemeName): Theme {
  const base = name === "dark" ? DarkTheme : DefaultTheme;
  const c = palettes[name];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.primary,
      background: c.bg,
      card: c.surfaceDim,
      text: c.text,
      border: c.line,
      notification: c.danger,
    },
  };
}
