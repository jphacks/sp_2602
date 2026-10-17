// 端末に残す小さなデータの置き場（AsyncStorage）。アプリを閉じても消えない。
// 置くもの: 合言葉とログインした人（session.tsx）・C7 の設定のキャッシュ（config-cache.ts）・C8 の送信待ち（usage-outbox.ts）・MOCK のログインの端末番号（google.ts）。
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
  outbox: "slope.usage-outbox", // C8 の送信待ち
  mockDeviceId: "slope.mock-device-id", // MOCK の「はじめての人」をこの端末だけの人にする番号
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

// ログアウトのときに消すもの（送信待ちの利用記録は消さない: 子どもの記録を失わないため。次にログインした同じ子どもが送る）
export async function clearSessionData(storage: KeyValueStorage = appStorage): Promise<void> {
  await storage.removeItem(storageKeys.session);
}
