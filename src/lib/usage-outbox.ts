// C8: 利用記録の送信待ち（アウトボックス）。子どもの端末で測った記録を端末に保存し、通信できるときにサーバへ送る（FigJam「C8 共通フロー」）。
// 決まり:
//   - 1回分の記録に送信 ID（UUID）を付けて保存する。送り直しても同じ ID を使う（サーバが二重に保存しない）
//   - サーバが受け付けた（accepted / duplicate）分だけ送信待ちから消す
//   - 通信・サーバの一時的な失敗は送信待ちのまま、間をあけて（バックオフ）送り直す
//   - 検証エラーなど直らない失敗は、その記録だけ隔離（quarantined）して自動では送り直さない。ほかの記録は送り続ける
//   - 契約（UsageDayReport）に合わない記録は、入れるとき（enqueue）と読むとき（1件ずつ）に検査し、合わない分だけ隔離する
//     （なぜ: 前は送信待ちの一覧全体をまとめて検査していたので、1件でも合わないと一覧が「ない」扱いになり、
//      次の書き込みでまだ送っていない記録まで消えていた。MVP_SPEC 4.3「検証エラーは該当データを隔離し、他の正常データは同期継続」）
// 中心は createUsageOutbox（保存・送信・時計・ID を外から渡す。テストで差し替える）。
//   await usageOutbox.enqueue(childId, days);  // C2 の結果（今日と昨日の UsageDayReport）を送信待ちに入れる
//   await usageOutbox.flush();                     // 起動時・通信の復帰時・画面を開いたときなどに呼ぶ
import type { ApiError } from "@contracts/errors";
import { UsageDayReport, type UsageUpload, type UsageUploadResult } from "@contracts/schemas";
import { z } from "zod";
import { ApiCallError, call } from "./api";
import { appStorage, type KeyValueStorage, readJson, storageKeys, writeJson } from "./storage";

// 送信待ちの1件
const itemFields = {
  submissionId: z.string(),
  childId: z.string(),
  createdAt: z.string(),
  attempts: z.number().int().min(0), // 送ろうとした回数
  nextAttemptAt: z.string(), // これより前は送らない（バックオフ）
  state: z.enum(["pending", "quarantined"]), // quarantined = 隔離（自動では送らない）
  lastError: z.object({ code: z.string(), message: z.string() }).nullable(),
  // 契約に合わなかった記録（送らない。原因を調べるために中身を残す）。ふだんはない
  rejectedDays: z.array(z.unknown()).optional(),
};
const OutboxItem = z.object({ ...itemFields, days: z.array(UsageDayReport) });
export type OutboxItem = z.infer<typeof OutboxItem>;

// 端末に保存してある形を読むときは、記録の中身（days）を検査せずに読む。中身の検査は1件ずつ（toItem）で行う
const StoredItem = z.object({ ...itemFields, days: z.array(z.unknown()) });
const StoredList = z.array(z.unknown());

// 契約に合わない記録の隔離の理由（サーバに送っても bad_request になるので、同じ code にする）
const invalidError = {
  code: "bad_request",
  message: "利用記録の形が決まりに合わないため、送らずに残しています",
} as const;

// 保存してあった1件を、送れる形に直す。記録の形が契約に合わなければ、その1件だけを隔離する
// （記録を分けて一部だけ送ることはしない: 同じ送信 ID で中身を変えると、サーバが「中身が違う」と断るため）。
// 読めないもの（送信 ID もない壊れた値）は、どの記録か分からず送れないので null（一覧から外す）
function toItem(raw: unknown): OutboxItem | null {
  const stored = StoredItem.safeParse(raw);
  if (!stored.success) return null;
  const days = z.array(UsageDayReport).safeParse(stored.data.days);
  if (days.success) return { ...stored.data, days: days.data };
  return {
    ...stored.data,
    days: [],
    rejectedDays: [...(stored.data.rejectedDays ?? []), ...stored.data.days],
    state: "quarantined",
    lastError: { ...invalidError },
  };
}

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
  const read = async (): Promise<OutboxItem[]> =>
    ((await readJson(deps.storage, storageKeys.outbox, StoredList)) ?? []).flatMap((raw) => {
      const item = toItem(raw);
      return item ? [item] : [];
    });
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
      if (item.days.length === 0) {
        // 送る記録がない（契約上、1回に1日以上が必要）。送るものがないので送信待ちから外す
        await update(item.submissionId, () => null);
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
    // 記録を送信待ちに入れる（送信 ID はここで1回だけ作る）。
    // 契約（UsageDayReport）に合う記録は送る1件に、合わない記録は別の1件にして隔離する（合わない記録が、ほかの記録を巻き込まないように）。
    // 返すのは送る1件（合う記録がなければ隔離した1件。同じ中身を何度も入れ直さないよう、呼んだ側が「入れた」と覚えるため）
    async enqueue(childId: string, days: readonly UsageDayReport[]): Promise<OutboxItem | null> {
      if (days.length === 0) return null;
      const valid: UsageDayReport[] = [];
      const invalid: unknown[] = [];
      for (const d of days) {
        const r = UsageDayReport.safeParse(d);
        if (r.success) valid.push(r.data);
        else invalid.push(d);
      }
      const base = { childId, createdAt: now().toISOString(), attempts: 0, nextAttemptAt: now().toISOString() };
      const added: OutboxItem[] = [];
      if (valid.length > 0) {
        // 1回に送れるのは 7 日分まで（契約の UsageUpload）。ふだんは今日と昨日の2日分
        for (let i = 0; i < valid.length; i += 7)
          added.push({
            ...base,
            submissionId: newId(),
            days: valid.slice(i, i + 7),
            state: "pending",
            lastError: null,
          });
      }
      if (invalid.length > 0)
        added.push({
          ...base,
          submissionId: newId(),
          days: [],
          rejectedDays: invalid,
          state: "quarantined",
          lastError: { ...invalidError },
        });
      await write([...(await read()), ...added]);
      return added[0] ?? null;
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

    // ある子どもの送信待ちを全部消す（その子どもがこの端末でログアウトしたとき。別の人で入り直したときに混ざらないように）。
    // 送っている途中のものは、送り終えたときにもう一覧にないので、そのまま消えたままになる
    async removeChild(childId: string): Promise<void> {
      const items = await read();
      if (items.some((x) => x.childId === childId)) await write(items.filter((x) => x.childId !== childId));
    },

    // 隔離した記録をもう一度送る対象に戻す（原因を直したあと。自動では呼ばない）。
    // 契約に合わない記録だけの1件（送れる記録がない）は、送っても同じ結果なので戻さない
    async retryQuarantined(submissionId: string): Promise<void> {
      await update(submissionId, (x) =>
        x.days.length === 0 ? x : { ...x, state: "pending", nextAttemptAt: now().toISOString() },
      );
    },
  };
}

export type UsageOutbox = ReturnType<typeof createUsageOutbox>;

// アプリで使う1つ（サーバの usageUpload と端末の AsyncStorage につながっている）
export const usageOutbox: UsageOutbox = createUsageOutbox({
  storage: appStorage,
  send: (upload) => call("usageUpload", upload),
});
