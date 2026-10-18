// 日程（テスト期間・空白期間）の取得・保存・削除の呼び出し（React に依存しない。tests/schedule/ でサーバにつないで確かめる）。
// 画面からサーバへは src/lib/api.ts の call() だけを使う。保存・削除は expectedVersion（今の版）を付けて testPeriod* / blankPeriod* を呼ぶ。
// サーバは保存と C10 の再計算を1回の処理で済ませてから返す（Q5）。返ってきたら成功を出してよい。失敗は ApiCallError で投げられる。
import { call } from "@/lib/api";
import type { Period, PeriodKind, PeriodSource, ValidPeriod } from "./logic";

export async function fetchPeriods(kind: PeriodKind, childId: string): Promise<PeriodSource> {
  if (kind === "test") {
    const r = await call("testPeriodList", { childId });
    return {
      periods: r.testPeriods,
      configVersion: r.configVersion,
      changedVersion: r.periodsChangedVersion,
      childAppliedVersion: r.childAppliedVersion,
    };
  }
  const r = await call("blankPeriodList", { childId });
  return {
    periods: r.blankPeriods,
    configVersion: r.configVersion,
    changedVersion: r.blankChangedVersion,
    childAppliedVersion: r.childAppliedVersion,
  };
}

type SaveInput = ValidPeriod & { childId: string; expectedVersion: number; id?: string };

// 作成（id なし）か更新（id あり）。結果は新しい設定の版
export async function savePeriod(kind: PeriodKind, input: SaveInput): Promise<{ configVersion: number }> {
  const { id, ...rest } = input;
  if (kind === "test") return id ? call("testPeriodUpdate", { ...rest, id }) : call("testPeriodCreate", rest);
  return id ? call("blankPeriodUpdate", { ...rest, id }) : call("blankPeriodCreate", rest);
}

export async function deletePeriod(
  kind: PeriodKind,
  input: { childId: string; expectedVersion: number; id: string },
): Promise<{ configVersion: number }> {
  return kind === "test" ? call("testPeriodDelete", input) : call("blankPeriodDelete", input);
}

// C7 の設定の組から作る、一覧が取れないときの代わり（childAppliedVersion・一覧が最後に変わった版は組に入っていないので、
// null と今の版にしておく。古い一覧では反映済み／反映待ちを出さないので、画面には出ない）
export function fallbackFrom(
  snapshot: { configVersion: number; testPeriods: Period[]; blankPeriods: Period[] } | null,
  kind: PeriodKind,
): PeriodSource | null {
  if (!snapshot) return null;
  return {
    periods: kind === "test" ? snapshot.testPeriods : snapshot.blankPeriods,
    configVersion: snapshot.configVersion,
    changedVersion: snapshot.configVersion,
    childAppliedVersion: null,
  };
}
