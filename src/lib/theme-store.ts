// テーマカラー（子06・親06 の「白色」「黒色」）の選択肢・文言・端末への保存。React を使わない部分だけをここに置く
// （Node のテスト tests/lib/theme.test.ts から確かめられるように。画面で使う仕組みは theme.tsx）。
// 保存は storage.ts の仕組み（AsyncStorage・Zod で形を確かめる）を使う。キーは storageKeys.theme。
// 保存がない・壊れている・知らない値（古い版や新しい版のアプリが書いた形）のときは既定のライトにする（落とさない）。
// ログアウトでは消さない（人ではなく端末の好み。sign-out.ts・clearSessionData はこのキーに触れない）。
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

const themeNameSchema = z.enum(["light", "dark"]);

// 設定の一覧の右に出す値（「白色」「黒色」）
export function themeLabel(name: ThemeName): string {
  return THEME_OPTIONS.find((o) => o.name === name)?.label ?? THEME_OPTIONS[0].label;
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
