// tmp/animations/rnweb/whiteboard/theme/themes.ts から写したもの。直すなら元を直して写し直す（node scripts/sync-kids-ui.mjs）。
// 確認ページで切り替える3つのテーマ（名前 → 色の組）。アプリの ThemeName（"light" | "dark"）に足す前の仮の名前。
//   whiteboard … 白色（ホワイトボードとマーカー）  palette.ts（土台の担当）
//   chalkboard … 黒色（黒板とチョーク）            chalk.ts（黒板の担当）
//   notebook   … ベージュ（ノートと鉛筆・蛍光ペン） pencil.ts（ノートの担当）
// どのテーマで描くかは、確認ページの URL の ?theme=（なければ whiteboard）で決める（stubs/lib/theme.tsx）。
// 道具（marker・chalk・pencil）はテーマの名前から tools/index.tsx の toolNameForTheme が決める。
import type { ColorPalette } from "@contracts/tokens";
import { chalkboard } from "./chalk";
import { whiteboard } from "./palette";
import { notebook } from "./pencil";

export type KidsThemeName = "whiteboard" | "chalkboard" | "notebook";

export const kidsPalettes: Readonly<Record<KidsThemeName, ColorPalette>> = { whiteboard, chalkboard, notebook };

// 地が暗いテーマ（画面の切り替えの地・ステータスバーの文字の色を暗い側にする）
export const darkThemes: ReadonlySet<KidsThemeName> = new Set(["chalkboard"]);

export function themeFromUrl(): KidsThemeName {
  const q = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("theme");
  return q === "chalkboard" || q === "notebook" ? q : "whiteboard";
}
