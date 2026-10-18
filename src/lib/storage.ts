// 端末に残す小さなデータの置き場（AsyncStorage）。アプリを閉じても消えない。
// 置くもの: 合言葉とログインした人（session.tsx）・C7 の設定のキャッシュ（config-cache.ts）・C8 の送信待ち（usage-outbox.ts）・MOCK のログインの端末番号（google.ts）・
//   テーマカラーと配色（theme-store.ts）・Q15 で前に送ったアプリの一覧（child-apps-sync.ts）。
// ログアウトでは、合言葉・設定のキャッシュ・その人の送信待ち・前に送ったアプリの一覧を消す（別の人で入り直したときに混ざらないように。sign-out.ts）。
// テーマカラーと配色はログアウトでも消さない（人ではなく端末の好みなので）。
// 読むときは Zod で形を確かめ、壊れていたら「ない」として扱う（古い版のアプリが書いた形でも落ちないように）。
// テストでは tests/stubs/async-storage.ts（メモリ上）に置き換わる（vitest.config.ts）。
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { z } from "zod";

// 読み書きの窓口。config-cache・usage-outbox はこの形を受け取るので、テストでは別の実装を渡せる
export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const appStorage: KeyValueStorage = AsyncStorage;

// キーの一覧（ここ以外でキーの文字列を書かない。消し忘れ・打ち間違いを防ぐ）
export const storageKeys = {
  session: "slope.session", // ログインした人（Session。合言葉を含む）
  config: (childId: string) => `slope.config.${childId}`, // C7 の最後の正常なスナップショット
  configIndex: "slope.config-index", // 設定のキャッシュを持っている子どもの一覧（ログアウトで全部消すため）
  outbox: "slope.usage-outbox", // C8 の送信待ち
  mockDeviceId: "slope.mock-device-id", // MOCK の「はじめての人」をこの端末だけの人にする番号
  theme: "slope.theme", // テーマカラー（"light" | "dark" | "notebook"。ログアウトでも消さない）
  colorScheme: "slope.colorScheme", // 子ども用の見た目の配色（"red" | "green" | "blue"。ログアウトでも消さない）
  childApps: (childId: string) => `slope.child-apps.${childId}`, // Q15 で前に送ったアプリの一覧（変わったときだけ送るため）
} as const;

// JSON で読む。ない・壊れている・形が違うときは null
export async function readJson<T>(storage: KeyValueStorage, key: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const raw = await storage.getItem(key);
    if (raw == null) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeJson(storage: KeyValueStorage, key: string, value: unknown): Promise<void> {
  await storage.setItem(key, JSON.stringify(value));
}

// 合言葉とログインした人を消す（ログアウト・合言葉が無効になったとき）。
// 設定のキャッシュと送信待ちは、ここでは消さない（合言葉の期限切れでは、同じ人がまたログインして送るため）。
// 自分でログアウトしたときは sign-out.ts の clearLocalDataFor がそれらも消す
export async function clearSessionData(storage: KeyValueStorage = appStorage): Promise<void> {
  await storage.removeItem(storageKeys.session);
}
