// 保護者のホーム画面のウィジェット（Figma 親08）に渡す値を作る（純粋な関数。tests/parent/widget.test.ts）。
//   左「初日から」: 「40 分 減」「上限 300→260分」。親03 振り返りと同じ limitReduction（review.ts）の結果をそのまま使う
//   右「テストまで」: 「あと 13 日」。テストの日程を渡し、次のテストは Kotlin が描くたびに選ぶ（子どものウィジェットと同じ）
// ウィジェットは Slope が動いていないときにも描かれるので、今日から先の日ごとの値をまとめて渡す
// （保護者が何日か Slope を開かなくても、その日の値が出る。一覧にない日は Kotlin が「Slope を開くと出ます」と出す）。
// 渡し方: ParentWidgetSync（ParentDataProvider の中）が設定を取るたびに parentWidgetUpdate で決めて native.saveParentWidget(...)。
// 子どもとつながっていない（連携を外した・家族が空）ときは unlinkedParentWidgetData（前の子どもの数字を残さない。D-133）。
// 取れない値は 0 と出さず、文で知らせる（docs/architecture.md 4章）。
import { addDays } from "@contracts/dates";
import type { NativeParentReduction, NativeParentWidget } from "@contracts/native";
import type { Child, ConfigSnapshot } from "@contracts/schemas";
import type { ConfigState } from "@/lib/config-cache";
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

// 子どもとつながっていない保護者のウィジェット（D-133。連携を外したあと・家族の一覧が空のとき）。
// 前の子どもの「減り」とテストの日程を残さず、毎日「つながっていません」の文にする（形は保護者のまま）
export function unlinkedParentWidgetData(today: string, days: number = PARENT_WIDGET_DAYS): NativeParentWidget {
  return {
    days: Array.from({ length: days }, (_, i) => ({
      date: addDays(today, i),
      reduction: { kind: "message", title: "つながっていません", body: "子どもと QR でつなぐと出ます" },
    })),
    testPeriods: [],
  };
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

// 設定（C7）と家族の一覧から、ウィジェットに保存する値を決める（ParentWidgetSync.tsx が使う。null = 保存しない＝前の値を残す）。
//   家族の一覧が空 → 「つながっていません」（D-133）
//   設定がない・取れない（unavailable）→ 保存しない（0 分減と出さない）
//   設定の子どもが家族の一覧にいない → 保存しない。なぜ: 連携を外す前に始まった読み直しが外したあとに届くと、
//     前の子どもの値でウィジェットを上書きしてしまうため（D-133 の再検査）。一覧がまだ読めていない（null）ときは保存する
export function parentWidgetUpdate(
  config: ConfigState | null,
  family: readonly Pick<Child, "id">[] | null,
  today: string,
): NativeParentWidget | null {
  if (family != null && family.length === 0) return unlinkedParentWidgetData(today);
  if (!config || config.status === "unavailable") return null;
  const childId = config.snapshot.childId;
  if (family != null && !family.some((c) => c.id === childId)) return null;
  return parentWidgetData(config.snapshot, today);
}
