// 保護者のホーム画面のウィジェット（Figma 親08）に渡す値を作る（純粋な関数。tests/parent/widget.test.ts）。
//   左「初日から」: 「40 分 減」「上限 300→260分」。親03 振り返りと同じ limitReduction（review.ts）の結果をそのまま使う
//   右「テストまで」: 「あと 13 日」。テストの日程を渡し、次のテストは Kotlin が描くたびに選ぶ（子どものウィジェットと同じ）
// ウィジェットは Slope が動いていないときにも描かれるので、今日から先の日ごとの値をまとめて渡す
// （保護者が何日か Slope を開かなくても、その日の値が出る。一覧にない日は Kotlin が「Slope を開くと出ます」と出す）。
// 渡し方: ParentDataProvider（src/lib/parent-data.tsx）が設定を取るたびに native.saveParentWidget(parentWidgetData(...))。
// 取れない値は 0 と出さず、文で知らせる（docs/architecture.md 4章）。
import { addDays } from "@contracts/dates";
import type { NativeParentReduction, NativeParentWidget } from "@contracts/native";
import type { ConfigSnapshot } from "@contracts/schemas";
import { md } from "./format";
import { limitReduction, type Reduction } from "./review";

// 何日先の分まで渡すか（サーバの日別上限は今日〜120日先。ひと月あれば足りる）
export const PARENT_WIDGET_DAYS = 31;

// 振り返りの「減り」→ ウィジェットの左に出すもの（date はその値の日）。
// 計画の初日は、親03 と同じく「0 分 減」ではなく「今日が計画の初日」と出す
export function reductionForWidget(r: Reduction, date: string): NativeParentReduction {
  switch (r.kind) {
    case "ok":
      if (r.startDate === date)
        return { kind: "message", title: "今日が計画の初日", body: `上限 ${r.todayLimit}分 から始まります` };
      return { kind: "ok", reducedMinutes: r.reducedMinutes, fromLimit: r.startLimit, toLimit: r.todayLimit };
    case "no_plan":
      return { kind: "message", title: "計画がまだありません", body: "計画を決めると出ます" };
    case "not_started":
      return { kind: "message", title: "まだ始まっていません", body: `計画は ${md(r.startDate)} から` };
    case "unlimited_today":
      return { kind: "message", title: "今日は制限なし", body: "空白期間の日です" };
    case "unknown":
      return { kind: "message", title: "まだ分かりません", body: "Slope を開くと出ます" };
  }
}

export function parentWidgetData(
  snapshot: Pick<ConfigSnapshot, "plan" | "dailyLimits" | "testPeriods">,
  today: string,
  days: number = PARENT_WIDGET_DAYS,
): NativeParentWidget {
  return {
    days: Array.from({ length: days }, (_, i) => {
      const date = addDays(today, i);
      return { date, reduction: reductionForWidget(limitReduction(snapshot, date), date) };
    }),
    testPeriods: snapshot.testPeriods.map(({ name, startDate, endDate }) => ({ name, startDate, endDate })),
  };
}
