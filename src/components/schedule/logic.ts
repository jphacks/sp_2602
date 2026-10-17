// 日程（テスト期間・空白期間）の画面で使う「判断」をまとめた純粋な関数（React・通信に依存しない。tests/schedule/ でテストする）。
//   - 入力の検査（空の名前・終了日 < 開始日・同じ種類の期間との重なり）… サーバも同じことを断るが、送る前に止めて入力を残す
//   - 一覧の並べ方（近い順: 期間中・これからのものを開始日の早い順 → 終わったものを新しい順）
//   - 表示の文言（「10月28日（水）〜10月30日（金）」・完了のダイアログ・削除の確認・反映済み／反映待ち）
//   - 保存の失敗の出し分け（conflict は読み込み直しへ・bad_request は入力を残す・not_found は一覧へ）
//   - 一覧の取得結果の状態（取れた・古い・取得不可）の移り変わり
import { formatDateJa, formatDateLongJa } from "@contracts/dates";
import type { ApiError } from "@contracts/errors";
import type { Role, TestPeriod } from "@contracts/schemas";

// テスト期間（D3。親子どちらも変えられる。Q11）か、空白期間（Q7。保護者だけ。期間中は制限なし）か
export type PeriodKind = "test" | "blank";

// 一覧・編集で扱う1件（TestPeriod と BlankPeriod の共通部分。作った人はテスト期間だけにある）
export type Period = {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD（その日を含む）
  endDate: string; // YYYY-MM-DD（その日を含む）
  createdByUserId?: string;
  createdByRole?: Role;
};

// 一覧の1件がテスト期間（作った人つき）なら TestPeriod として返す（flow の editTest に渡すため）。空白期間なら null
export function asTestPeriod(p: Period): TestPeriod | null {
  if (p.createdByUserId == null || p.createdByRole == null) return null;
  return {
    id: p.id,
    name: p.name,
    startDate: p.startDate,
    endDate: p.endDate,
    createdByUserId: p.createdByUserId,
    createdByRole: p.createdByRole,
  };
}

// 入力中の値（日付は未入力なら null）
export type PeriodDraft = { name: string; startDate: string | null; endDate: string | null };
export type PeriodErrors = Partial<Record<"name" | "startDate" | "endDate", string>>;

export const NAME_MAX = 120; // contracts/schemas.ts の periodFields.name と同じ上限

export const emptyDraft: PeriodDraft = { name: "", startDate: null, endDate: null };

export function draftOf(p: Period): PeriodDraft {
  return { name: p.name, startDate: p.startDate, endDate: p.endDate };
}

// ── 画面の文言 ──────────────────────────────────────────────

// 種類と見る人ごとの文言。子どもの文言は Figma（子03・子05・子10）のまま。
// 保護者の登録画面と空白期間の画面は Figma にないので、同じ並びで文だけ変えた
export function periodTexts(kind: PeriodKind, viewer: Role) {
  if (kind === "test")
    return {
      noun: "テスト日程",
      listTitle: "テスト日程の一覧・変更",
      createTitle: viewer === "child" ? "テストの日程を入れよう" : "テスト日程の登録",
      createBanner: viewer === "child" ? "次のテストの日程を入れてください" : "テストの名前と期間を入れてください",
      editTitle: "テスト日程の変更",
      // Figma 子05 と同じ所で改行する（幅まかせだと「くだ／さい」で切れる）
      editBanner: "変更するテストの日程を\n入れてください",
      nameLabel: "テスト名",
      namePlaceholder: "例: 期末テスト",
      nameRequired: "テスト名を入れてください",
      addLabel: "テストを追加する",
      emptyMessage: "予定のテストはありません",
      emptyHint: "「テストを追加する」から登録できます",
      pastHeader: "終わったテスト",
      missing: "このテスト日程は見つかりません",
      listBanner: null as string | null,
    };
  return {
    noun: "空白期間",
    listTitle: "空白期間の一覧・変更",
    createTitle: "空白期間の登録",
    createBanner: "夏休みなど、制限をかけない期間を入れてください",
    editTitle: "空白期間の変更",
    editBanner: "変更する空白期間を入れてください",
    nameLabel: "名前",
    namePlaceholder: "例: 夏休み",
    nameRequired: "名前を入れてください",
    addLabel: "空白期間を追加する",
    emptyMessage: "空白期間はありません",
    emptyHint: "「空白期間を追加する」から登録できます",
    pastHeader: "終わった空白期間",
    missing: "この空白期間は見つかりません",
    listBanner: "空白期間のあいだは、1日の上限がなくなります（制限なし）。終わると元の上限に戻ります。" as
      | string
      | null,
  };
}

// ── 日付の文言 ──────────────────────────────────────────────

// 1日ずつの文言（「10月28日（水）」「2026年10月28日（水）」）は contracts/dates.ts の formatDateJa・formatDateLongJa（アプリで1か所）
const yearOf = (date: string) => date.slice(0, 4);

// 期間の文言。1日だけなら「10月28日（水）」、複数日なら「10月28日（水）〜10月30日（金）」。
// 年をまたぐ・今年でない期間は、取り違えないよう年も付ける（today を渡したときだけ「今年か」を見る）
export function formatPeriodRange(startDate: string, endDate: string, today?: string): string {
  const sy = yearOf(startDate);
  const withYear = sy !== yearOf(endDate) || (today !== undefined && sy !== yearOf(today));
  const f = withYear ? formatDateLongJa : formatDateJa;
  return startDate === endDate ? f(startDate) : `${f(startDate)}〜${f(endDate)}`;
}

// ── 入力の操作と検査 ──────────────────────────────────────────

// 開始日を選んだとき。終了日が未入力か開始日より前なら、終了日を開始日にそろえる（1日だけのテストをすぐ入れられるように）
export function withStartDate(draft: PeriodDraft, startDate: string): PeriodDraft {
  const endDate = draft.endDate == null || draft.endDate < startDate ? startDate : draft.endDate;
  return { ...draft, startDate, endDate };
}

export function withEndDate(draft: PeriodDraft, endDate: string): PeriodDraft {
  return { ...draft, endDate };
}

// 2つの期間が1日でも重なるか（両端の日を含む。サーバの store.ts の assertNoOverlap と同じ考え方）
export function overlaps(a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export type ValidPeriod = { name: string; startDate: string; endDate: string };

// 送る前の検査。others は同じ種類の登録済みの期間（編集中のものは editingId で除く）。
// 重なりは同じ種類どうしだけを見る（テスト期間と空白期間は重なってよい。空白期間の日が「制限なし」になる）
// TODO(未決): 重なる期間の扱いは MVP_SPEC 9章 High。今はサーバ（C10）と同じく「重なりは断る」
export function validatePeriod(
  draft: PeriodDraft,
  others: Period[],
  kind: PeriodKind,
  editingId?: string,
): { ok: true; value: ValidPeriod } | { ok: false; errors: PeriodErrors } {
  const errors: PeriodErrors = {};
  const name = draft.name.trim();
  if (name.length === 0) errors.name = periodTexts(kind, "child").nameRequired;
  else if (name.length > NAME_MAX) errors.name = `${NAME_MAX}文字以内にしてください`;
  if (draft.startDate == null) errors.startDate = "開始日を選んでください";
  if (draft.endDate == null) errors.endDate = "終了日を選んでください";
  else if (draft.startDate != null && draft.endDate < draft.startDate)
    errors.endDate = "終了日は開始日と同じか、それより後にしてください";

  if (!errors.startDate && !errors.endDate && draft.startDate != null && draft.endDate != null) {
    const mine = { startDate: draft.startDate, endDate: draft.endDate };
    const hit = [...others]
      .filter((o) => o.id !== editingId)
      .sort(byStart)
      .find((o) => overlaps(o, mine));
    if (hit) {
      errors.startDate = "期間が重なっています";
      errors.endDate = `「${hit.name}」（${formatPeriodRange(hit.startDate, hit.endDate)}）と重なっています。重ならない日付にしてください`;
    }
  }

  if (Object.keys(errors).length > 0 || draft.startDate == null || draft.endDate == null) return { ok: false, errors };
  return { ok: true, value: { name, startDate: draft.startDate, endDate: draft.endDate } };
}

// ── 一覧 ────────────────────────────────────────────────

const byStart = (a: Period, b: Period) =>
  a.startDate !== b.startDate
    ? a.startDate < b.startDate
      ? -1
      : 1
    : a.endDate !== b.endDate
      ? a.endDate < b.endDate
        ? -1
        : 1
      : a.name.localeCompare(b.name, "ja");

export type PeriodPhase = "ongoing" | "upcoming" | "past";

export function periodPhase(p: { startDate: string; endDate: string }, today: string): PeriodPhase {
  if (p.endDate < today) return "past";
  return p.startDate <= today ? "ongoing" : "upcoming";
}

// 近い順。current = 期間中・これから（開始日の早い順。期間中のものが先頭に来る）、past = 終わったもの（終わった日の新しい順）
export function sortPeriodsForList<T extends Period>(periods: T[], today: string): { current: T[]; past: T[] } {
  const current = periods.filter((p) => p.endDate >= today).sort(byStart);
  const past = periods
    .filter((p) => p.endDate < today)
    .sort((a, b) => (a.endDate !== b.endDate ? (a.endDate < b.endDate ? 1 : -1) : byStart(a, b)));
  return { current, past };
}

// 一覧の1行の文言。showCreator は保護者の一覧で「だれが登録したか」を出すとき（Q11: 作った人を残す）
export function periodRowText(p: Period, today: string, opts: { showCreator?: boolean } = {}) {
  const range = formatPeriodRange(p.startDate, p.endDate, today);
  const creator =
    opts.showCreator && p.createdByRole ? (p.createdByRole === "child" ? "お子さんが登録" : "保護者が登録") : null;
  const phase = periodPhase(p, today);
  const value = phase === "ongoing" ? "期間中" : phase === "past" ? "終了" : undefined;
  const subtitle = creator ? `${range}・${creator}` : range;
  return {
    title: p.name,
    subtitle,
    value,
    accessibilityLabel: [p.name, range, value, creator].filter(Boolean).join("、"),
  };
}

// ── ダイアログの文言 ─────────────────────────────────────────

export type DoneKind = "created" | "updated" | "deleted";

// 保存・削除がサーバで確定したあとに出すダイアログ（子04「登録しました。」と同じ形）
export function doneDialog(what: DoneKind, kind: PeriodKind, p: ValidPeriod) {
  const range = formatPeriodRange(p.startDate, p.endDate);
  // Figma 子04: 「10月28日（水）の数学を／登録しました。」。空白期間は名前を「」でくくる（「夏休み」など、文に埋もれないように）
  const name = kind === "test" ? p.name : `「${p.name}」`;
  if (what === "created") return { title: "登録しました。", body: `${range}の${name}を登録しました。` };
  if (what === "updated") return { title: "変更しました。", body: `${range}の${name}に変更しました。` };
  return { title: "削除しました。", body: `${name}（${range}）を削除しました。` };
}

// 削除の確認（MVP_SPEC 5.1「削除確認」）。消すと1日の上限が計算し直されることも伝える
export function deleteConfirmText(kind: PeriodKind, p: Period) {
  const noun = periodTexts(kind, "child").noun;
  return {
    title: `「${p.name}」を削除しますか？`,
    body: `${formatPeriodRange(p.startDate, p.endDate)}の${noun}を削除します。削除すると、1日の上限が計算し直されます。`,
  };
}

// ── 保存の失敗の出し分け ───────────────────────────────────────

//   reload : 版がずれた（conflict）→ 読み込み直してからもう一度
//   back   : 対象がもうない（not_found）→ 一覧へ
//   retry  : 通信・サーバの失敗 → 同じ入力でもう一度押せばよい
//   none   : 入力を直す（bad_request）・できない操作（forbidden）
export type FailureAction = "reload" | "back" | "retry" | "none";
export type SaveFailure = { error: ApiError; action: FailureAction; actionLabel: string | null };

export function saveFailure(error: ApiError, kind: PeriodKind): SaveFailure {
  switch (error.code) {
    case "conflict":
      // 版のずれ（Q6）。サーバの文は一般的な「すでに処理されています」のことがあるので、何が起きたかを言い直す
      return {
        error: {
          ...error,
          message: "ほかの端末で変更されました。読み込み直してください",
          hint: "最新の内容を読み込んでから、もう一度ためしてください",
        },
        action: "reload",
        actionLabel: "読み込み直す",
      };
    case "not_found":
      return {
        error: {
          ...error,
          message: periodTexts(kind, "child").missing,
          hint: "ほかの端末で削除された可能性があります。一覧に戻って確かめてください",
        },
        action: "back",
        actionLabel: "一覧に戻る",
      };
    case "bad_request":
      // 重なり・日付の逆転など。サーバの文（「〇〇」と期間が重なっています 等）をそのまま出し、入力は残す
      return { error, action: "none", actionLabel: null };
    case "forbidden":
      return kind === "blank"
        ? {
            error: {
              ...error,
              message: "空白期間は保護者だけが変えられます",
              hint: "保護者の端末から操作してください",
            },
            action: "none",
            actionLabel: null,
          }
        : { error, action: "none", actionLabel: null };
    case "unauthorized":
      // ログアウトの扱いは session.tsx が行う（ここでは文を出すだけ）
      return { error, action: "none", actionLabel: null };
    default:
      return { error, action: "retry", actionLabel: "もう一度ためす" };
  }
}

// ── 反映済み／反映待ち（Q6。保護者の一覧に出す）──────────────────────

export function appliedStatus(configVersion: number, childAppliedVersion: number | null) {
  if (childAppliedVersion == null)
    return {
      tone: "warning" as const,
      label: "反映待ち",
      hint: "お子さんの端末がまだ設定を受け取っていません",
    };
  if (childAppliedVersion < configVersion)
    return {
      tone: "warning" as const,
      label: "反映待ち",
      hint: "お子さんの端末が次に通信したときに反映されます",
    };
  return { tone: "success" as const, label: "反映済み", hint: "お子さんの端末に反映されています" };
}

// ── 一覧の取得結果の状態 ────────────────────────────────────────

// サーバから取った一覧と、そのときの設定の版（保存のときの expectedVersion に使う）
export type PeriodSource = { periods: Period[]; configVersion: number; childAppliedVersion: number | null };

//   loading     : まだ一度も取れていない
//   fresh       : サーバから取れた
//   stale       : 取れなかったので、前に取れた一覧（なければ C7 の設定の組）を出している（最新でない可能性あり）
//   unavailable : 何もない（取得不可。0件とは出さない）
export type PeriodsState =
  | { status: "loading" }
  | { status: "fresh"; data: PeriodSource }
  | { status: "stale"; data: PeriodSource; error: ApiError | null }
  | { status: "unavailable"; error: ApiError | null };

// 取れなかったときの次の状態。前に取れた一覧があればそれを優先し、なければ C7 の組（fallback）を使う
export function periodsOnError(
  prev: PeriodsState,
  fallback: PeriodSource | null,
  error: ApiError | null,
): PeriodsState {
  if (prev.status === "fresh" || prev.status === "stale") return { status: "stale", data: prev.data, error };
  if (fallback) return { status: "stale", data: fallback, error };
  return { status: "unavailable", error };
}

export function sourceOf(state: PeriodsState): PeriodSource | null {
  return state.status === "fresh" || state.status === "stale" ? state.data : null;
}

// 編集する1件を決める。known は一覧の画面から受け取った値（flow の editTest。すぐ出すため）
//   一覧がサーバから取れていて、その中にない → missing（ほかの端末で消された）
//   一覧が古い・まだ取れていない → known があればそれを使う
export type EditTarget =
  | { status: "found"; period: Period }
  | { status: "loading" }
  | { status: "missing" }
  | { status: "unavailable"; error: ApiError | null };

export function resolveEditTarget(id: string, known: Period | null, state: PeriodsState): EditTarget {
  const knownHit = known && known.id === id ? known : null;
  const data = sourceOf(state);
  const hit = data?.periods.find((p) => p.id === id) ?? null;
  if (hit) return { status: "found", period: hit };
  if (state.status === "fresh") return { status: "missing" };
  if (knownHit) return { status: "found", period: knownHit };
  if (state.status === "loading") return { status: "loading" };
  if (state.status === "unavailable") return { status: "unavailable", error: state.error };
  return { status: "missing" };
}
