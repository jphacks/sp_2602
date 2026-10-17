// ログアウトのときに、端末に残したその人のデータを消す（session.tsx の signOut が呼ぶ）。
// なぜ: 同じ端末で別の人がログインし直したときに、前の人の設定（C7 のキャッシュ）や、まだ送っていない利用記録（C8 の送信待ち）が
//   混ざらないようにするため。子どもの userId はそのまま childId なので、その子どもの送信待ちを消す（保護者には送信待ちはない）。
// 合言葉の期限切れ（401）では呼ばない（同じ人がまたログインして、残った記録を送れるように）。
import { type ConfigCache, configCache } from "./config-cache";
import { type UsageOutbox, usageOutbox } from "./usage-outbox";

type Deps = { configCache: Pick<ConfigCache, "clearAll">; usageOutbox: Pick<UsageOutbox, "removeChild"> };

export async function clearLocalDataFor(userId: string, deps: Deps = { configCache, usageOutbox }): Promise<void> {
  // 片方が失敗しても、もう片方は消す
  await Promise.allSettled([deps.configCache.clearAll(), deps.usageOutbox.removeChild(userId)]);
}
