// テーマの名前のつなぎ（手で書いたもの）。React を使わない部分だけをここに置く（tests/kids/ から確かめる）。
//   写した部品の中の名前（src/kids/theme/themes.ts の KidsThemeName）: whiteboard・chalkboard・notebook
//   アプリが保存する名前（contracts/tokens.ts の ThemeName）        : light・dark・notebook
//   light（白色）→ whiteboard（ホワイトボードとマーカー） / dark（黒色）→ chalkboard（黒板とチョーク） / notebook（ベージュ）→ notebook（ノートと鉛筆）
import type { ThemeName } from "@contracts/tokens";
import type { KidsThemeName } from "./theme/themes";

const KIDS_THEME: Readonly<Record<ThemeName, KidsThemeName>> = {
  light: "whiteboard",
  dark: "chalkboard",
  notebook: "notebook",
};

// 保存しているテーマの名前 → 子ども用の見た目のテーマの名前（知らない名前はホワイトボード）
export function kidsThemeOf(name: ThemeName): KidsThemeName {
  return KIDS_THEME[name] ?? "whiteboard";
}
