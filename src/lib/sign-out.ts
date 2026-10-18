// ログアウトのときに、端末に残したその人のデータを消す（session.tsx の signOut が呼ぶ）。
// なぜ: 同じ端末で別の人がログインし直したときに、前の人の設定（C7 のキャッシュ）や、まだ送っていない利用記録（C8 の送信待ち）が
//   混ざらないようにするため。子どもの userId はそのまま childId なので、その子どもの送信待ちを消す（保護者には送信待ちはない）。
//   Q15 で前に送ったアプリの一覧（端末のアプリの名前の一覧）も消す（端末に残さない。入り直したら送り直す）。
//   保護者の端末のメモリにある子どものアプリのアイコン（app-icons.ts）も消す。
// 合言葉の期限切れ（401）では呼ばない（同じ人がまたログインして、残った記録を送れるように）。
// ログアウトの最初に、合言葉をサーバでも無効にする（revokeServerSession。401 で自動でログアウトしたときは呼ばない）。
import { call, timeoutSignal } from "./api";
import { type AppIconCache, appIconCache } from "./app-icons";
import { type ChildAppsSync, childAppsSync } from "./child-apps-sync";
import { type ConfigCache, configCache } from "./config-cache";
import { type UsageOutbox, usageOutbox } from "./usage-outbox";

type Deps = {
  configCache: Pick<ConfigCache, "clearAll">;
  usageOutbox: Pick<UsageOutbox, "removeChild">;
  childAppsSync: Pick<ChildAppsSync, "clear">;
  appIcons: Pick<AppIconCache, "clear">;
};

// ログアウトのときにサーバへ「この合言葉を無効にして」と頼むのを待つ時間。
// 通信できない・サーバが応答しないときもログアウトは進めるので、ふつうの呼び出し（20 秒）より短くする
export const REVOKE_TIMEOUT_MS = 5_000;

type RevokeDeps = { revoke: (signal: AbortSignal) => Promise<unknown>; timeout: (ms: number) => AbortSignal };
const revokeDeps: RevokeDeps = {
  revoke: (signal) => call("authSignOut", undefined, { signal }),
  timeout: timeoutSignal,
};

// 今の合言葉をサーバでも無効にする（authSignOut）。失敗（通信できない・時間切れ・もう無効で 401 など）は黙って無視する。
// なぜ: 前はログアウトしても端末の合言葉を消すだけで、サーバでは最後に使ってから30日まで使えるまま残った。
//   ただし、サーバに届かないからといってログアウトできないのは困るので、結果は待つが失敗してもそのまま進める。
// 合言葉は呼んだ時点のもの（api.ts の setSessionToken）が付くので、端末の合言葉を消す前に呼ぶ
export async function revokeServerSession(deps: RevokeDeps = revokeDeps): Promise<void> {
  try {
    await deps.revoke(deps.timeout(REVOKE_TIMEOUT_MS));
  } catch {
    // 黙って無視する（ログアウトは進める）
  }
}

export async function clearLocalDataFor(
  userId: string,
  deps: Deps = { configCache, usageOutbox, childAppsSync, appIcons: appIconCache },
): Promise<void> {
  // どれかが失敗しても、ほかは消す
  deps.appIcons.clear(); // メモリの上だけなので失敗しない
  await Promise.allSettled([
    deps.configCache.clearAll(),
    deps.usageOutbox.removeChild(userId),
    deps.childAppsSync.clear(userId),
  ]);
}
