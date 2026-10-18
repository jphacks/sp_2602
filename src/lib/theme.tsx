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
//
// 見た目（look）は2つ: 保護者の今の見た目（classic）と、子ども用の見た目（kids。src/kids/KidsUI.tsx が ThemeLook で包む）。
//   保存するテーマの名前は1つ（light・dark・notebook）。classic では notebook をライトとして描く（今の見た目にノートの色の組がないため）。
//   kids は同じ名前のまま、色の組だけを子ども用（ホワイトボード・黒板・ノート）に替える。makeStyles は見た目ごとに別に覚える。
import { type ColorPalette, palettes, type ThemeName } from "@contracts/tokens";
import { DarkTheme, DefaultTheme, type Theme } from "expo-router";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { classicThemeName, DEFAULT_THEME, loadThemeName, saveThemeName } from "./theme-store";

type ThemeValue = { name: ThemeName; colors: ColorPalette; setTheme: (name: ThemeName) => void };
// 中で持つ値: 見た目（look。makeStyles の覚え場所の鍵）と、保存しているテーマの名前（saved。classic の name は notebook を light に直したもの）
type ThemeState = ThemeValue & { look: string; saved: ThemeName };

const CLASSIC = "classic";

const ThemeContext = createContext<ThemeState>({
  name: DEFAULT_THEME,
  colors: palettes[DEFAULT_THEME],
  setTheme: () => {},
  look: CLASSIC,
  saved: DEFAULT_THEME,
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

  const value = useMemo<ThemeState | null>(() => {
    if (!name) return null;
    const shown = classicThemeName(name);
    return { name: shown, colors: palettes[shown], setTheme, look: CLASSIC, saved: name };
  }, [name, setTheme]);
  if (!value) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

export function useColors(): ColorPalette {
  return useContext(ThemeContext).colors;
}

// 保存しているテーマの名前（notebook もそのまま）。子ども用の見た目が色の組を選ぶのに使う
export function useSavedThemeName(): ThemeName {
  return useContext(ThemeContext).saved;
}

// 中の画面だけ、見た目（look）・テーマの名前・色の組を替える（子ども用の見た目 src/kids/KidsUI.tsx）。
// 保存と setTheme は外のまま（選び直すと、外の ThemeProvider が保存して、両方の見た目が描き直される）
export function ThemeLook({
  look,
  name,
  colors,
  children,
}: {
  look: string;
  name: ThemeName;
  colors: ColorPalette;
  children: ReactNode;
}) {
  const outer = useContext(ThemeContext);
  const value = useMemo<ThemeState>(
    () => ({ name, colors, setTheme: outer.setTheme, look, saved: outer.saved }),
    [name, colors, look, outer.setTheme, outer.saved],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// 色を使うスタイルの作り方。factory は色の組を受け取って StyleSheet を返す。テーマごとに1回だけ呼ぶ
export function makeStyles<T>(factory: (c: ColorPalette) => T): () => T {
  // 鍵は見た目とテーマの名前（同じ "light" でも、保護者と子ども用で色の組が違う）
  const cache = new Map<string, T>();
  return function useStyles(): T {
    const { name, colors, look } = useContext(ThemeContext);
    const key = `${look}:${name}`;
    let styles = cache.get(key);
    if (styles === undefined) {
      styles = factory(colors);
      cache.set(key, styles);
    }
    return styles;
  };
}

// 画面の切り替え（expo-router の Stack・Tabs）の地の色。画面の裏や切り替えの途中に白が見えないよう、今のテーマの色を渡す
// colors を渡すと、その色の組で作る（子ども用の見た目。省くと保護者の今の見た目の色の組）
export function navigationTheme(name: ThemeName, colors?: ColorPalette): Theme {
  const base = name === "dark" ? DarkTheme : DefaultTheme;
  const c = colors ?? palettes[classicThemeName(name)];
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
