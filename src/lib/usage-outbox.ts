// C8: 利用記録の送信待ち（アウトボックス）。子どもの端末で測った記録を端末に保存し、通信できるときにサーバへ送る（FigJam「C8 共通フロー」）。
// 決まり:
//   - 1回分の記録に送信 ID（UUID）を付けて保存する。送り直しても同じ ID を使う（サーバが二重に保存しない）
//   - サーバが受け付けた（accepted / duplicate）分だけ送信待ちから消す
//   - 通信・サーバの一時的な失敗は送信待ちのまま、間をあけて（バックオフ）送り直す
//   - 検証エラーなど直らない失敗は、その記録だけ隔離（quarantined）して自動では送り直さない。ほかの記録は送り続ける
// 中心は createUsageOutbox（保存・送信・時計・ID を外から渡す。テストで差し替える）。
//   await usageOutbox.enqueue(childId, days);  // C2 の結果（今日と昨日の UsageDayReport）を送信待ちに入れる
//   await usageOutbox.flush();                     // 起動時・通信の復帰時・画面を開いたときなどに呼ぶ
import type { ApiError } from "@contracts/errors";
import { UsageDayReport, type UsageUpload, type UsageUploadResult } from "@contracts/schemas";
import { z } from "zod";
import { ApiCallError, call } from "./api";
import { appStorage, type KeyValueStorage, readJson, storageKeys, writeJson } from "./storage";

// 送信待ちの1件
const OutboxItem = z.object({
  submissionId: z.string(),
  childId: z.string(),
  days: z.array(UsageDayReport),
  createdAt: z.string(),
  attempts: z.number().int().min(0), // 送ろうとした回数
  nextAttemptAt: z.string(), // これより前は送らない（バックオフ）
  state: z.enum(["pending", "quarantined"]), // quarantined = 隔離（自動では送らない）
  lastError: z.object({ code: z.string(), message: z.string() }).nullable(),
});
export type OutboxItem = z.infer<typeof OutboxItem>;
const OutboxList = z.array(OutboxItem);

// 1回の flush の結果
export type FlushResult = { sent: number; retrying: number; quarantined: number; skipped: number };

// 直らない失敗（送り直しても同じ結果になる）か。true なら隔離する
//   bad_request（形が違う）・forbidden（この端末の子どもではない）・conflict（同じ ID で中身が違う）・not_found
// それ以外（network・timeout・upstream_failed・internal・rate_limited・unauthorized）は一時的とみなして送り直す
// （unauthorized はログインし直せば送れるので隔離しない）
export function isPermanentError(error: ApiError): boolean {
  return ["bad_request", "forbidden", "conflict", "not_found"].includes(error.code);
}

// バックオフ: 1回目の失敗の後 30 秒、そのあと倍ずつ、最大 15 分
// TODO(未決): 間隔と回数（図・仕様に数値がない。FigJam の図の矛盾 21）
export function backoffMs(attempts: number, baseMs = 30_000, maxMs = 15 * 60_000): number {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempts - 1));
}

// UUID（v4）を作る。React Native に crypto.randomUUID がないときは Math.random で作る（送信 ID の重複を避けるだけなので十分）
export function newSubmissionId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[8 + Math.floor(Math.random() * 4)];
    else out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

export type OutboxDeps = {
  storage: KeyValueStorage;
  send: (upload: UsageUpload) => Promise<UsageUploadResult>;
  now?: () => Date;
  newId?: () => string;
};

export function createUsageOutbox(deps: OutboxDeps) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? newSubmissionId;
  const read = async () => (await readJson(deps.storage, storageKeys.outbox, OutboxList)) ?? [];
  const write = (items: OutboxItem[]) => writeJson(deps.storage, storageKeys.outbox, items);
  let flushing: Promise<FlushResult> | null = null;

  // 1件ずつ読み・書きし直す（送っている間に enqueue された分を消さないため）
  const update = async (submissionId: string, fn: (item: OutboxItem) => OutboxItem | null) => {
    const items = await read();
    const next: OutboxItem[] = [];
    for (const item of items) {
      if (item.submissionId !== submissionId) next.push(item);
      else {
        const changed = fn(item);
        if (changed) next.push(changed);
      }
    }
    await write(next);
  };

  async function flushOnce(): Promise<FlushResult> {
    const result: FlushResult = { sent: 0, retrying: 0, quarantined: 0, skipped: 0 };
    const t = now();
    for (const item of await read()) {
      if (item.state === "quarantined") {
        result.quarantined++;
        continue;
      }
      if (Date.parse(item.nextAttemptAt) > t.getTime()) {
        result.skipped++;
        continue;
      }
      try {
        await deps.send({ submissionId: item.submissionId, childId: item.childId, days: item.days });
        // accepted でも duplicate でも、サーバに保存済みなので消す
        await update(item.submissionId, () => null);
        result.sent++;
      } catch (e) {
        const error: ApiError =
          e instanceof ApiCallError ? e.error : { code: "network", message: "送信できませんでした", hint: "" };
        const attempts = item.attempts + 1;
        if (isPermanentError(error)) {
          await update(item.submissionId, (x) => ({
            ...x,
            attempts,
            state: "quarantined",
            lastError: { code: error.code, message: error.message },
          }));
          result.quarantined++;
        } else {
          await update(item.submissionId, (x) => ({
            ...x,
            attempts,
            nextAttemptAt: new Date(t.getTime() + backoffMs(attempts)).toISOString(),
            lastError: { code: error.code, message: error.message },
          }));
          result.retrying++;
        }
      }
    }
    return result;
  }

  return {
    // 記録を送信待ちに入れる（送信 ID はここで1回だけ作る）
    async enqueue(childId: string, days: UsageDayReport[]): Promise<OutboxItem | null> {
      if (days.length === 0) return null;
      const item: OutboxItem = {
        submissionId: newId(),
        childId,
        days,
        createdAt: now().toISOString(),
        attempts: 0,
        nextAttemptAt: now().toISOString(),
        state: "pending",
        lastError: null,
      };
      await write([...(await read()), item]);
      return item;
    },

    // 送れるものを送る。同時に2回呼ばれても、送るのは1回（同じ記録を並べて送らない）
    flush(): Promise<FlushResult> {
      flushing ??= flushOnce().finally(() => {
        flushing = null;
      });
      return flushing;
    },

    // 送信待ちの一覧（画面で「未送信 n 件」「修正待ち n 件」を出すため）
    list: read,

    // 隔離した記録をもう一度送る対象に戻す（原因を直したあと。自動では呼ばない）
    async retryQuarantined(submissionId: string): Promise<void> {
      await update(submissionId, (x) => ({ ...x, state: "pending", nextAttemptAt: now().toISOString() }));
    },
  };
}

export type UsageOutbox = ReturnType<typeof createUsageOutbox>;

// アプリで使う1つ（サーバの usageUpload と端末の AsyncStorage につながっている）
export const usageOutbox: UsageOutbox = createUsageOutbox({
  storage: appStorage,
  send: (upload) => call("usageUpload", upload),
});
