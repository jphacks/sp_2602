// テーマカラー（子06・親06 の「白色」「黒色」、子ども用の見た目では「ベージュ」も）の選択肢・文言・端末への保存。React を使わない部分だけをここに置く
// （Node のテスト tests/lib/theme.test.ts から確かめられるように。画面で使う仕組みは theme.tsx）。
// 保存は storage.ts の仕組み（AsyncStorage・Zod で形を確かめる）を使う。キーは storageKeys.theme。
// 保存がない・壊れている・知らない値（古い版や新しい版のアプリが書いた形）のときは既定のライトにする（落とさない）。
// ログアウトでは消さない（人ではなく端末の好み。sign-out.ts・clearSessionData はこのキーに触れない）。
// 配色（赤・緑・青）も同じ作り（キーは storageKeys.colorScheme。既定は緑）。配色は子ども用の見た目だけに効く
// （「使った時間」「テスト」の色と、選んでいるタブの下線が変わる。保護者の今の見た目は変えない）。
// 端末の保存だけで、サーバとの約束（contracts）には入れない（人ではなく端末の好みなので、サーバへは送らない）。
import type { ThemeName } from "@contracts/tokens";
import { z } from "zod";
import { appStorage, type KeyValueStorage, readJson, storageKeys, writeJson } from "./storage";

export type { ThemeName };

export const DEFAULT_THEME: ThemeName = "light";

// 選択肢（上から順にダイアログに並べる）。文言は Figma 子06・親06・子07・親04 の「白色」「黒色」
export const THEME_OPTIONS = [
  { name: "light", label: "白色" },
  { name: "dark", label: "黒色" },
] as const satisfies readonly { name: ThemeName; label: string }[];

// 子ども用の見た目（src/kids）の選択肢。Figma「UI子供用」子06 の3つ（白色＝ホワイトボード・黒色＝黒板・ベージュ＝ノート）。
// 保存する名前は保護者と同じ（light・dark）に notebook を足しただけ（子と親で同じ端末の好みを使う）。
// label はダイアログの行、short は設定の一覧の右の値（Figma 子07 は「白色」）。
export const KIDS_THEME_OPTIONS = [
  { name: "light", label: "白色（ホワイトボード）", short: "白色" },
  { name: "dark", label: "黒色（黒板）", short: "黒色" },
  { name: "notebook", label: "ベージュ（ノート）", short: "ベージュ" },
] as const satisfies readonly { name: ThemeName; label: string; short: string }[];

const themeNameSchema = z.enum(["light", "dark", "notebook"]);

// 保護者の今の見た目で描くテーマ。ノート（notebook）は今の見た目に色の組がないので、ライトとして描く
export function classicThemeName(name: ThemeName): "light" | "dark" {
  return name === "dark" ? "dark" : "light";
}

// 設定の一覧の右に出す値（「白色」「黒色」）。保護者の見た目なので、ノートは「白色」（ライトとして描いているため）
export function themeLabel(name: ThemeName): string {
  const shown = classicThemeName(name);
  return THEME_OPTIONS.find((o) => o.name === shown)?.label ?? THEME_OPTIONS[0].label;
}

// 子ども用の見た目の、設定の一覧の右に出す値（「白色」「黒色」「ベージュ」）
export function kidsThemeLabel(name: ThemeName): string {
  return KIDS_THEME_OPTIONS.find((o) => o.name === name)?.short ?? KIDS_THEME_OPTIONS[0].short;
}

// ステータスバー（時計・電池）の文字の色。暗い地には明るい文字（"light"）、明るい地には暗い文字（"dark"）
export function statusBarStyle(name: ThemeName): "light" | "dark" {
  return name === "dark" ? "light" : "dark";
}

// 端末に保存したテーマを読む。ない・壊れているときは既定（ライト）
export async function loadThemeName(storage: KeyValueStorage = appStorage): Promise<ThemeName> {
  return (await readJson(storage, storageKeys.theme, themeNameSchema)) ?? DEFAULT_THEME;
}

export async function saveThemeName(name: ThemeName, storage: KeyValueStorage = appStorage): Promise<void> {
  await writeJson(storage, storageKeys.theme, name);
}

// ── 配色（子07 の「配色の変更」・ダイアログの「赤」「緑」「青」） ──

export type ColorSchemeName = "red" | "green" | "blue";

// 既定は緑（今のホワイトボード・ノートの「使った時間」の緑に近いので、配色を足す前の見た目からの変わり方が小さい）
export const DEFAULT_COLOR_SCHEME: ColorSchemeName = "green";

// 選択肢（上から順にダイアログに並べる）。label はダイアログの行と、設定の一覧の右の値の両方に使う
export const COLOR_SCHEME_OPTIONS = [
  { name: "red", label: "赤" },
  { name: "green", label: "緑" },
  { name: "blue", label: "青" },
] as const satisfies readonly { name: ColorSchemeName; label: string }[];

const colorSchemeSchema = z.enum(["red", "green", "blue"]);

// 設定の一覧の右に出す値（「赤」「緑」「青」）。知らない名前は既定（緑）
export function colorSchemeLabel(name: ColorSchemeName): string {
  const label = (n: string) => COLOR_SCHEME_OPTIONS.find((o) => o.name === n)?.label;
  return label(name) ?? label(DEFAULT_COLOR_SCHEME) ?? COLOR_SCHEME_OPTIONS[0].label;
}

// 端末に保存した配色を読む。ない・壊れている・知らない値のときは既定（緑）
export async function loadColorScheme(storage: KeyValueStorage = appStorage): Promise<ColorSchemeName> {
  return (await readJson(storage, storageKeys.colorScheme, colorSchemeSchema)) ?? DEFAULT_COLOR_SCHEME;
}

export async function saveColorScheme(name: ColorSchemeName, storage: KeyValueStorage = appStorage): Promise<void> {
  await writeJson(storage, storageKeys.colorScheme, name);
}
