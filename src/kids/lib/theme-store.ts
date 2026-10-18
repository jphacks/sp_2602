// 子ども用の部品が読む theme-store（src/lib/theme-store.ts と同じ名前を出す中継ぎ。手で書いたもの。写したものではない）。
// 写した部品の `@/lib/theme-store` は、scripts/sync-kids-ui.mjs がここへ書き換える（src/kids/lib/ にあるものはこちらを読む決まり）。
// 違うのは選択肢と文言だけ: 子ども用の見た目は3つ（白色＝ホワイトボード・黒色＝黒板・ベージュ＝ノート。Figma 子06）。
// 保存・読み込み・既定・ステータスバーの色はアプリのものそのまま（保存する名前は保護者と同じ light・dark に notebook を足したもの）。
export {
  DEFAULT_THEME,
  KIDS_THEME_OPTIONS as THEME_OPTIONS,
  kidsThemeLabel as themeLabel,
  loadThemeName,
  saveThemeName,
  statusBarStyle,
  type ThemeName,
} from "@/lib/theme-store";
