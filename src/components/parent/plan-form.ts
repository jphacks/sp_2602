// 親02 計画を作る の入力の検査と初期値（純粋な関数。tests/parent/plan-form.test.ts）。
// 決まり（Q14）: 計画の開始日・開始上限 S・最終目標 G の3つは必須。分は 0〜1440 の整数・G ≤ S・開始日は今日以降。
// 通常上限（Q7 で紐づけ直後に決める値）は親02 でも変えられる。空のままなら送らない（今の値を保つ）。
// サーバも同じことを確かめる（契約の PlanSave と store.ts）。ここは送る前に、どの欄が悪いかをその場で見せるためのもの。
import type { PlanSave, PlanView } from "@contracts/schemas";
import { type DurationText, durationTextOf, emptyDuration, md, parseDuration } from "./format";

export type PlanForm = {
  startDate: string | null; // 計画の開始日（"YYYY-MM-DD"。未入力は null）
  start: DurationText; // 開始上限 S
  goal: DurationText; // 最終目標 G
  usual: DurationText; // 通常上限（任意）
};

export type PlanField = "startDate" | "start" | "goal" | "usual";
export type PlanFormErrors = Partial<Record<PlanField, string>>;

// 送る値（childId と expectedVersion は画面が足す）
export type PlanValues = Pick<
  PlanSave,
  "planStartDate" | "startLimitMinutes" | "finalGoalMinutes" | "usualLimitMinutes"
>;

export type PlanFormResult = { ok: true; value: PlanValues } | { ok: false; errors: PlanFormErrors };

const durationMessage = {
  not_number: "数字で入れてください",
  minutes_range: "分は 0〜59 で入れてください",
  out_of_range: "24時間（1440分）までで入れてください",
} as const;

export function validatePlanForm(form: PlanForm, today: string): PlanFormResult {
  const errors: PlanFormErrors = {};

  if (!form.startDate) errors.startDate = "計画の開始日を選んでください";
  else if (form.startDate < today) errors.startDate = `開始日は今日（${md(today)}）以降にしてください`;

  const s = parseDuration(form.start);
  if (!s.ok) errors.start = s.reason === "empty" ? "開始上限を入れてください" : durationMessage[s.reason];

  const g = parseDuration(form.goal);
  if (!g.ok) errors.goal = g.reason === "empty" ? "最終目標を入れてください" : durationMessage[g.reason];

  // G ≤ S（両方が読めたときだけ比べる）
  if (s.ok && g.ok && g.minutes > s.minutes) errors.goal = "最終目標は開始上限と同じか、それより短くしてください";

  // 通常上限は任意。空なら送らない
  const u = parseDuration(form.usual);
  if (!u.ok && u.reason !== "empty") errors.usual = durationMessage[u.reason];

  if (Object.keys(errors).length > 0 || !form.startDate || !s.ok || !g.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      planStartDate: form.startDate,
      startLimitMinutes: s.minutes,
      finalGoalMinutes: g.minutes,
      ...(u.ok ? { usualLimitMinutes: u.minutes } : {}),
    },
  };
}

// 画面を開いたときの入力の初期値。
//   計画がまだない: 開始日は今日、S・G は空、通常上限は今の値
//   計画がある    : S・G・通常上限は今の値。開始日は、今の計画の開始日が今日以降ならそのまま、
//                   もう始まっていれば今日（Q14「開始日は今日以降」。昨日以前の開始日では保存できないため）
// TODO(未決): 始まった計画の S・G だけを変えたいときの扱い（store.ts の planSave の TODO と同じ）。今は「今日から作り直す」になる
export function planFormFromView(view: PlanView | null, today: string): PlanForm {
  const plan = view?.plan ?? null;
  return {
    startDate: plan && plan.planStartDate >= today ? plan.planStartDate : today,
    start: plan ? durationTextOf(plan.startLimitMinutes) : emptyDuration,
    goal: plan ? durationTextOf(plan.finalGoalMinutes) : emptyDuration,
    usual: durationTextOf(view?.usualLimitMinutes ?? null),
  };
}

// 今の計画がもう始まっているか（画面で「作り直すと今日から新しく下がり始めます」と知らせるため）
export function planAlreadyStarted(view: PlanView | null, today: string): boolean {
  return !!view?.plan && view.plan.planStartDate < today;
}

// 保存のあと、画面の設定の組（C7）が保存した版まで追いついたか。
// planSave の応答が返った時点でサーバの C10 の再計算は済んでいる（Q5）。画面のグラフ（日別上限）がその結果になったかをここで見る。
//   confirmed: 新しい日別上限を読み込めた → 「計画を作りました」
//   loading  : まだ古い組しか手元にない（取り直しに失敗した等）→ 保存はできたが、グラフは少し待つと更新される
export function saveConfirmation(savedVersion: number, snapshotVersion: number | null): "confirmed" | "loading" {
  return snapshotVersion != null && snapshotVersion >= savedVersion ? "confirmed" : "loading";
}

// 子どもの端末に、ある版の設定が届いたか（Q6）。
//   childAppliedVersion: 子どもの端末が使っている版（まだ一度も取りに来ていなければ null）
//   neededVersion      : その変更が入った版（計画なら configVersion、対象外アプリなら sinceVersion など）
export function reflectState(childAppliedVersion: number | null, neededVersion: number): "applied" | "pending" {
  return childAppliedVersion != null && childAppliedVersion >= neededVersion ? "applied" : "pending";
}

// 30 秒ごとの取り直し（planGet）で、入力欄と保存に使う版（expectedVersion）をどうするか。
//   まだ何も触っていない（edited = false）: サーバの今の値と版に合わせ直す。
//     なぜ: 開いたときの版のままにしておくと、そのあと子どもがテストを足す・通常上限を別の画面で変える等で版が上がったとき、
//           保護者が何も触っていないのに最初の「計画を作る」が必ず「ほかの端末で設定が変わりました」になり、
//           入力欄にも古い値（変える前の通常上限など）が残る（実機で確認。10/17 デバッグ）。
//   触り始めた（edited = true）: 打ちかけを消さず、触り始めたときの版を保つ（ほかの端末の変更に conflict で気づけるように）。
export function syncPlanInput(
  current: { form: PlanForm | null; baseVersion: number | null },
  view: PlanView,
  today: string,
  edited: boolean,
): { form: PlanForm; baseVersion: number } {
  if (edited && current.form && current.baseVersion != null)
    return { form: current.form, baseVersion: current.baseVersion };
  return { form: planFormFromView(view, today), baseVersion: view.configVersion };
}
