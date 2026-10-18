// C7: 設定（テスト期間・日別上限・対象外アプリ・版）の取得とキャッシュ（MVP_SPEC 4.3、FigJam「C7 UML」）。
// 決まり:
//   - サーバの ConfigSnapshot を「1組」として丸ごと採用する。版の違う組を混ぜない
//   - 応答の epoch（サーバの DB ごとに決まる値。D-109）が手元の組の epoch と違えば、版を比べずに手元を捨てて届いた組を採用する
//     （changed: false で中身がなければ knownVersion なしで取り直す）。epoch のない古い保存分も「違う」とみなす。
//     なぜ: DB を作り直す・PGlite と Neon を切り替えると版が 0 から数え直されるので、版だけでは新旧を比べられない
//   - epoch が同じなら: 手元より古い版の応答は捨てる（手元を保つ）。同じ版で中身が違うのは整合性エラー（手元を保つ）
//   - 通信に失敗したら、最後に正常だったキャッシュを stale（最新でない可能性あり）として返す。キャッシュもなければ unavailable
//   - C2 の取得・C8 の送信は、ここが失敗しても止めない（別々に動く）
// 中心の判断（reconcileConfig）は純粋な関数。保存と通信は createConfigCache に渡す（テストで差し替える）。
//   const state = await configCache.refresh(childId);
//   if (state.status !== "unavailable") 画面に state.snapshot を出す（stale なら「最新でない可能性があります」も出す）
import type { ApiError } from "@contracts/errors";
import { CachedConfig, type ConfigResult, type ConfigSnapshot } from "@contracts/schemas";
import { z } from "zod";
import { call, errorOf } from "./api";
import { appStorage, type KeyValueStorage, readJson, storageKeys, writeJson } from "./storage";

// 画面が受け取る状態
export type ConfigState =
  | { status: "fresh"; snapshot: ConfigSnapshot; savedAt: string } // サーバで確かめた最新の組
  | { status: "stale"; snapshot: ConfigSnapshot; savedAt: string; reason: StaleReason; error: ApiError | null } // 最後に正常だった組
  | { status: "unavailable"; error: ApiError | null }; // 何もない（取得不可。上限を 0 分として扱わない）

// stale の理由
//   not_checked    : まだサーバに確かめていない（起動直後に端末の保存分だけを読んだ）
//   network        : 通信・サーバの失敗
//   older_response : サーバの応答が手元より古い版だった（同じ epoch のときだけ。応答を捨てた）
//   integrity      : 同じ版なのに中身が違った（応答を捨てた）
//   invalid        : 応答の中身が決まりに合わない（別の子どもの組など）
//   save_failed    : 新しい組を端末に保存できなかった
// TODO(未決): older_response で手元のほうが新しいのに「古い可能性あり」と出すのは図どおり（FigJam の図の矛盾 14）。決まったら見直す
export type StaleReason = "not_checked" | "network" | "older_response" | "integrity" | "invalid" | "save_failed";

// 設定のキャッシュを持っている子どもの一覧の形
const IndexList = z.array(z.string());

// サーバの応答を、手元の組と比べてどうするかを決める（純粋な関数）
//   adopt   : 新しい組として採用する（epoch も一緒に保存する）
//   keep    : 手元の組がそのまま最新（同じ epoch・同じ版）
//   refetch : knownVersion を付けずに取り直す（「変わっていない」と言われたが、手元にその版がない・手元の epoch が違う）
//   discard : 応答を捨てて手元を保つ（reason つき）
export type Reconcile =
  | { action: "adopt"; snapshot: ConfigSnapshot; epoch: string }
  | { action: "keep" }
  | { action: "refetch" }
  | { action: "discard"; reason: "older_response" | "integrity" | "invalid" };

// 生成時刻だけが違うものは同じ中身とみなす
const contentOf = (s: ConfigSnapshot) => JSON.stringify({ ...s, generatedAt: "" });

// cached は端末に保存してある組（epoch がなければ、epoch を足す前に保存した組）
export function reconcileConfig(
  childId: string,
  cached: Pick<CachedConfig, "snapshot" | "epoch"> | null,
  result: ConfigResult,
): Reconcile {
  // 別の DB の版（または epoch の分からない古い保存分）とは版を比べられないので、手元はないものとして決める
  const mine = cached && cached.epoch === result.epoch ? cached.snapshot : null;
  if (!result.changed) {
    return mine && mine.configVersion === result.configVersion ? { action: "keep" } : { action: "refetch" };
  }
  const incoming = result.snapshot;
  if (incoming.childId !== childId) return { action: "discard", reason: "invalid" };
  // 同じ組の中で日付が重複していたら、どちらを使うか決められないので採用しない
  const dates = incoming.dailyLimits.map((l) => l.date);
  if (new Set(dates).size !== dates.length) return { action: "discard", reason: "invalid" };
  if (!mine) return { action: "adopt", snapshot: incoming, epoch: result.epoch };
  if (incoming.configVersion < mine.configVersion) return { action: "discard", reason: "older_response" };
  if (incoming.configVersion === mine.configVersion)
    return contentOf(incoming) === contentOf(mine) ? { action: "keep" } : { action: "discard", reason: "integrity" };
  return { action: "adopt", snapshot: incoming, epoch: result.epoch };
}

export type ConfigCacheDeps = {
  storage: KeyValueStorage;
  fetchConfig: (childId: string, knownVersion: number | undefined) => Promise<ConfigResult>;
  now?: () => Date;
};

export function createConfigCache(deps: ConfigCacheDeps) {
  const now = deps.now ?? (() => new Date());
  const read = (childId: string) => readJson(deps.storage, storageKeys.config(childId), CachedConfig);
  // 設定のキャッシュを持っている子どもの一覧（clearAll で全部消すため。KeyValueStorage にはキーの一覧を取る手段がない）
  const readIndex = async () => (await readJson(deps.storage, storageKeys.configIndex, IndexList)) ?? [];
  const addToIndex = async (childId: string) => {
    const ids = await readIndex();
    if (!ids.includes(childId)) await writeJson(deps.storage, storageKeys.configIndex, [...ids, childId]);
  };

  const staleOr = (cached: CachedConfig | null, reason: StaleReason, error: ApiError | null): ConfigState =>
    cached
      ? { status: "stale", snapshot: cached.snapshot, savedAt: cached.savedAt, reason, error }
      : { status: "unavailable", error };

  return {
    // 端末に保存してある組だけを読む（起動直後、通信の前にすぐ出すため）
    async load(childId: string): Promise<ConfigState> {
      return staleOr(await read(childId), "not_checked", null);
    },

    // サーバに確かめて、採用する組を決める
    async refresh(childId: string): Promise<ConfigState> {
      const before = await read(childId);
      let result: ConfigResult;
      try {
        // epoch のない古い保存分は、どの DB の版か分からないので版を送らない（中身つきで返してもらい、丸ごと置き換える）
        result = await deps.fetchConfig(childId, before?.epoch ? before.snapshot.configVersion : undefined);
      } catch (e) {
        return staleOr(before, "network", errorOf(e));
      }
      // 待っている間にほかの取得が新しい組を保存したかもしれないので、比べる前に読み直す（古い応答で上書きしない）
      let cached = await read(childId);
      let decision = reconcileConfig(childId, cached, result);
      if (decision.action === "refetch") {
        try {
          decision = reconcileConfig(childId, null, await deps.fetchConfig(childId, undefined));
        } catch (e) {
          return staleOr(cached, "network", errorOf(e));
        }
        cached = await read(childId);
        if (decision.action === "adopt" && cached)
          decision = reconcileConfig(childId, cached, {
            changed: true,
            snapshot: decision.snapshot,
            epoch: decision.epoch,
          });
      }
      switch (decision.action) {
        case "keep":
          return cached
            ? { status: "fresh", snapshot: cached.snapshot, savedAt: cached.savedAt }
            : { status: "unavailable", error: null };
        case "discard":
          return staleOr(cached, decision.reason, null);
        case "refetch":
          return staleOr(cached, "invalid", null);
        case "adopt": {
          const entry: CachedConfig = {
            snapshot: decision.snapshot,
            savedAt: now().toISOString(),
            epoch: decision.epoch,
          };
          try {
            await addToIndex(childId);
            await writeJson(deps.storage, storageKeys.config(childId), entry);
          } catch {
            return staleOr(cached, "save_failed", null);
          }
          return { status: "fresh", snapshot: entry.snapshot, savedAt: entry.savedAt };
        }
      }
    },

    // 端末に保存してある組の epoch（なければ null）。Q15 のアプリ一覧の送信が「DB が作り直されたか」を見るのに使う（child-apps-sync.ts）
    async epoch(childId: string): Promise<string | null> {
      return (await read(childId))?.epoch ?? null;
    },

    // 手元の組を消す（連携の解除のとき）
    async clear(childId: string): Promise<void> {
      await deps.storage.removeItem(storageKeys.config(childId));
      const ids = await readIndex();
      if (ids.includes(childId))
        await writeJson(
          deps.storage,
          storageKeys.configIndex,
          ids.filter((id) => id !== childId),
        );
    },

    // この端末にある組を全部消す（ログアウトのとき。保護者の端末にある子どもの組も、子どもの端末の自分の組も）
    async clearAll(): Promise<void> {
      for (const id of await readIndex()) await deps.storage.removeItem(storageKeys.config(id));
      await deps.storage.removeItem(storageKeys.configIndex);
    },
  };
}

export type ConfigCache = ReturnType<typeof createConfigCache>;

// アプリで使う1つ（サーバの configGet と端末の AsyncStorage につながっている）
export const configCache: ConfigCache = createConfigCache({
  storage: appStorage,
  fetchConfig: (childId, knownVersion) => call("configGet", { childId, knownVersion }),
});
