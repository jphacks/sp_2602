// 親03 振り返り の中身を作る（純粋な関数。tests/parent/review.test.ts）。
//   - limitReduction: 「初日（10/12）から今日（10/15）までに 40 分 減りました」「上限が 13% 減」
//   - reviewPeriod  : 期間の帯「前の試験 9/24 〜 今の試験 10/28」
//   - afterTestNote : 注意書き「テスト（10/28）が終わると、上限は一度少し戻ります。」
// 数字はすべてサーバの日別上限（C10 の結果）から拾う。ここで C10 を計算し直さない。
import type { ConfigSnapshot, TestPeriod } from "@contracts/schemas";
import { nextTest } from "@/lib/usage-calc";
import { md } from "./format";

// ── 減った量 ──
// TODO(未決): Q19「減った」は何と比べるか。仮に「計画の初日の上限」と「今日の上限」を比べる（上限の減り）。
//   理由: Figma 親03 の数字（40 分・13%）と親08 の「上限 300→260分」がこの読み方で一致する（300→260 = 40 分 = 13%）。
//   open-questions の Q19 のおすすめ（先週と今週の使用時間の比較）とは違うので、決まったらこの関数だけを差し替える。
export type Reduction =
  | { kind: "no_plan" } // 計画がまだない
  | { kind: "not_started"; startDate: string } // 計画がまだ始まっていない
  | { kind: "unlimited_today"; startDate: string } // 今日は空白期間で制限なし（比べられない）
  | { kind: "unknown"; startDate: string } // 初日か今日の上限が手元にない
  | {
      kind: "ok";
      startDate: string;
      startLimit: number; // 初日の上限（分）
      todayLimit: number; // 今日の上限（分）
      reducedMinutes: number; // 減った分（増えたときは負）
      percent: number | null; // 減った割合（%・四捨五入）。初日の上限が 0 分なら割れないので null
    };

export function limitReduction(snapshot: Pick<ConfigSnapshot, "plan" | "dailyLimits">, today: string): Reduction {
  const plan = snapshot.plan;
  if (!plan) return { kind: "no_plan" };
  const startDate = plan.planStartDate;
  if (today < startDate) return { kind: "not_started", startDate };
  const at = (date: string) => snapshot.dailyLimits.find((l) => l.date === date);
  const todayLimit = at(today);
  if (todayLimit?.kind === "unlimited") return { kind: "unlimited_today", startDate };
  // 初日が空白期間だった・初日の値がない（過去の確定値が残っていない）なら、計画の開始上限 S を初日の上限とみなす
  // （C10 の式で初日は B(d0) = S なので同じ値になる）
  const first = at(startDate);
  const startLimit = first?.kind === "limited" ? first.limitMinutes : plan.startLimitMinutes;
  if (todayLimit?.kind !== "limited") return { kind: "unknown", startDate };
  const reducedMinutes = startLimit - todayLimit.limitMinutes;
  return {
    kind: "ok",
    startDate,
    startLimit,
    todayLimit: todayLimit.limitMinutes,
    reducedMinutes,
    percent: startLimit > 0 ? Math.round((reducedMinutes / startLimit) * 100) : null,
  };
}

// ── 期間の帯 ──

// 前の試験 = 今日より前に終わったテストのうち、一番新しいもの
export function previousTest(testPeriods: readonly TestPeriod[], today: string): TestPeriod | null {
  return testPeriods.filter((t) => t.endDate < today).sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0] ?? null;
}

// 「前の試験 9/24 〜 今の試験 10/28」。前の試験がなければ計画の開始日、計画もなければ出さない。今の試験がなければ「今日」
export function reviewPeriod(snapshot: Pick<ConfigSnapshot, "plan" | "testPeriods">, today: string): string {
  const prev = previousTest(snapshot.testPeriods, today);
  const next = nextTest({ testPeriods: snapshot.testPeriods } as ConfigSnapshot, today);
  const left = prev
    ? `前の試験 ${md(prev.startDate)}`
    : snapshot.plan
      ? `計画の開始 ${md(snapshot.plan.planStartDate)}`
      : null;
  const right = next ? `今の試験 ${md(next.startDate)}` : `今日 ${md(today)}`;
  return left ? `${left} 〜 ${right}` : right;
}

// ── テストのあとの上限のお知らせ ──
// C10（MVP_SPEC 4.4）: 最後ではないテストが終わると上限は少し戻る（回復）。最後のテストのあとは最終目標 G のまま。
// 計画がない・次のテストがないときは出さない（null）
export function afterTestNote(snapshot: Pick<ConfigSnapshot, "plan" | "testPeriods">, today: string): string | null {
  if (!snapshot.plan) return null;
  const next = nextTest({ testPeriods: snapshot.testPeriods } as ConfigSnapshot, today);
  if (!next) return null;
  const hasLater = snapshot.testPeriods.some((t) => t.startDate > next.endDate);
  if (hasLater) return `テスト（${md(next.startDate)}）が終わると、上限は一度少し戻ります。`;
  return `テスト（${md(next.startDate)}）が最後のテストです。終わったあとも、上限は最終目標の ${snapshot.plan.finalGoalMinutes}分 のままです。`;
}
