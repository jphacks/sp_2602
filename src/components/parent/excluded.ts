// 親16 制限対象外アプリの管理 の行の中身（純粋な関数。tests/parent/excluded.test.ts）。
// 「反映済み／反映待ち」（Q6）: 子どもの端末が使っている版（childAppliedVersion）と、その変更が入った版を比べる。
//   対象外にしたアプリ : sinceVersion（対象外になった版）が子どもの版以下なら反映済み
//   対象外から外したアプリ: サーバの removedApps の removedVersion（外した版）で同じように比べる
//   一度も対象外になっていないアプリ: 子どもの端末の扱いは変わっていないので反映済み
//   （どれもサーバの値だけで決まるので、画面を開き直しても正しく出る）
//   一覧の全体: appsChangedVersion（一覧が最後に変わった版）が子どもの版以下なら反映済み（画面の上の札）
//   スイッチを動かしてまだ保存していない行は「未保存」
//   画面に出す文（rowNote）は、対象外にしていない落ち着いた行には何も出さない（理由は rowNote の上）
// 候補の一覧（Q15・D-110）: 子どもの端末から届いたアプリ一覧（childAppsGet）を表示名の順に並べ、保存済みの対象外アプリで
//   一覧にないもの（子どもが消したアプリなど）を後ろに足す（スイッチを OFF にできるように）。一覧がまだ届いていなければ、
//   保存済みのアプリだけ（見本の候補では埋めない）。アプリが多いので、名前で絞り込める（filterRows）。
import type { ExcludedApp, ExcludedAppInput, ExcludedAppsView, RemovedExcludedApp } from "@contracts/schemas";
import { reflectState } from "./plan-form";

export type RowStatus = "applied" | "pending" | "unsaved";

export type ExcludedRow = {
  packageName: string;
  label: string;
  initial: string;
  on: boolean; // 画面のスイッチ（対象外にするか）
  status: RowStatus;
  missing: boolean; // 保存済みだが、子どもの端末の一覧にない（消されたかもしれない）。一覧がまだ届いていなければ false
};

// 候補1つ。missing は「子どもの端末の一覧にない保存済みのアプリ」
export type Candidate = ExcludedAppInput & { missing: boolean };

// 表示名の順（日本語の並べ方。同じ名前なら packageName の順。サーバの並べ方と同じ）
const collator = new Intl.Collator("ja");
const byLabel = (a: ExcludedAppInput, b: ExcludedAppInput) =>
  collator.compare(a.label, b.label) || (a.packageName < b.packageName ? -1 : a.packageName > b.packageName ? 1 : 0);

// 並べる候補: 子どもの端末のアプリ一覧（表示名の順）のあとに、保存済みだが一覧にないアプリ（表示名の順）を足す
// （保存済みのものが画面から消えて OFF にできなくならないように）。childApps が null（まだ届いていない）なら保存済みのアプリだけ。
// 同じアプリが一覧と保存済みの両方にあれば、一覧の名前を使う（子どもの端末の今の名前）
export function candidateApps(
  childApps: readonly ExcludedAppInput[] | null,
  saved: readonly ExcludedApp[],
): Candidate[] {
  const listed = new Map<string, ExcludedAppInput>();
  for (const a of childApps ?? []) if (!listed.has(a.packageName)) listed.set(a.packageName, a);
  const extra = saved
    .filter((a) => !listed.has(a.packageName))
    .map((a) => ({ packageName: a.packageName, label: a.label }))
    .sort(byLabel);
  return [
    ...[...listed.values()].sort(byLabel).map((a) => ({ packageName: a.packageName, label: a.label, missing: false })),
    ...extra.map((a) => ({ ...a, missing: childApps != null })),
  ];
}

// 絞り込みの文字をそろえる（全角・半角、大文字・小文字、ひらがな・カタカナの違いを無視する）
function foldForSearch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .trim();
}

// 名前（または packageName）に query を含む行だけ。query が空なら全部
export function filterRows<T extends { label: string; packageName: string }>(rows: readonly T[], query: string): T[] {
  const q = foldForSearch(query);
  if (!q) return [...rows];
  return rows.filter((r) => foldForSearch(r.label).includes(q) || r.packageName.toLowerCase().includes(q));
}

export function excludedRows(input: {
  childApps: readonly ExcludedAppInput[] | null; // 子どもの端末のアプリ一覧（null = まだ届いていない）
  saved: readonly ExcludedApp[]; // サーバに保存されている対象外アプリ
  draft: ReadonlySet<string>; // 画面のスイッチが ON のアプリ（packageName）
  childAppliedVersion: number | null;
  removedAt: ReadonlyMap<string, number>; // 対象外から外したアプリと、外した版（removedVersions(view.removedApps)）
}): ExcludedRow[] {
  const savedBy = new Map(input.saved.map((a) => [a.packageName, a]));
  return candidateApps(input.childApps, input.saved).map((c) => {
    const savedApp = savedBy.get(c.packageName);
    const on = input.draft.has(c.packageName);
    let status: RowStatus;
    if (on !== !!savedApp) status = "unsaved";
    else if (savedApp) status = reflectState(input.childAppliedVersion, savedApp.sinceVersion);
    else {
      const removed = input.removedAt.get(c.packageName);
      status = removed == null ? "applied" : reflectState(input.childAppliedVersion, removed);
    }
    return {
      packageName: c.packageName,
      label: c.label,
      initial: Array.from(c.label)[0] ?? "?",
      on,
      status,
      missing: c.missing,
    };
  });
}

// スイッチの横に出す短い文字（2026-10-18 実機: 「YouTube を制限した」つもりでスイッチを ON にした人がいた。
//   ON は「制限しない」の意味なので、ON/OFF のどちらの意味かをスイッチのそばに文字で出す）
export function switchText(on: boolean): string {
  return on ? "制限しない" : "制限する";
}

// 行の名前の下に出す反映の状態。null なら何も出さない。
//   決め方（2026-10-18 実機の指摘: 対象外にしていない行にも「反映済み」が出ていて、何が反映済みなのか分からなかった）:
//     対象外にしていない行（OFF）で落ち着いているもの（一度も対象外にしていない・外したのが届いた）は出さない。
//       ふつうに制限されるアプリで、知らせることがないため（数百件の行がすべて「反映済み」になるのもうるさい）。
//     OFF にして保存したが、まだ子どもの端末に届いていない行だけ「制限にもどす: 反映待ち」と意味を足して出す
//       （届くまでは子どもの端末でまだ制限されないので、知らせる意味がある）。
//     対象外にした行（ON）は「制限しない: 反映済み／反映待ち」。まだ保存していない行は、保存するとどうなるかを出す。
export type RowNote = { label: string; kind: "chip" | "muted" | "warning" };

export function rowNote(row: Pick<ExcludedRow, "on" | "status">): RowNote | null {
  if (row.status === "unsaved") {
    return {
      label: row.on
        ? "まだ保存していません（保存すると制限しなくなります）"
        : "まだ保存していません（保存すると制限にもどります）",
      kind: "warning",
    };
  }
  if (row.on) {
    return row.status === "pending"
      ? { label: "制限しない: 反映待ち", kind: "chip" }
      : { label: "制限しない: 反映済み", kind: "muted" };
  }
  return row.status === "pending" ? { label: "制限にもどす: 反映待ち", kind: "chip" } : null;
}

// サーバの removedApps（対象外から外したアプリ）→ packageName ごとの外した版
export function removedVersions(removed: readonly RemovedExcludedApp[]): Map<string, number> {
  return new Map(removed.map((r) => [r.packageName, r.removedVersion]));
}

// 対象外アプリの一覧の全体が、子どもの端末に届いているか（画面の上の札）。一度も変えていなければ（版 0）届いている
export function excludedListStatus(
  view: Pick<ExcludedAppsView, "appsChangedVersion" | "childAppliedVersion">,
): "applied" | "pending" {
  if (view.appsChangedVersion === 0) return "applied";
  return reflectState(view.childAppliedVersion, view.appsChangedVersion);
}

// 保存する全件（契約の ExcludedAppsSave は差分ではなく全件の置き換え）
export function appsToSave(
  childApps: readonly ExcludedAppInput[] | null,
  saved: readonly ExcludedApp[],
  draft: ReadonlySet<string>,
): ExcludedAppInput[] {
  return candidateApps(childApps, saved)
    .filter((c) => draft.has(c.packageName))
    .map((c) => ({ packageName: c.packageName, label: c.label }));
}

// 保存の前後で、対象外から外れたアプリ（packageName）
export function removedApps(before: readonly ExcludedApp[], after: readonly ExcludedAppInput[]): string[] {
  const kept = new Set(after.map((a) => a.packageName));
  return before.filter((a) => !kept.has(a.packageName)).map((a) => a.packageName);
}

// まだ保存していない変更があるか
export function hasUnsaved(saved: readonly ExcludedApp[], draft: ReadonlySet<string>): boolean {
  if (saved.length !== draft.size) return true;
  return saved.some((a) => !draft.has(a.packageName));
}

// 30 秒ごとの取り直し（excludedAppsGet）で、スイッチの状態と保存に使う版（expectedVersion）をどうするか。
//   保存していない変更がない（スイッチが保存済みと同じ）: サーバの今の一覧と版に合わせ直す。
//     なぜ: 開いたときの版のままだと、そのあと子どもがテストを足す・計画を保存する等で版が上がったとき、
//           スイッチを1つ動かして保存しただけで必ず「ほかの端末で設定が変わりました」になる（親02 と同じ。10/17 デバッグ）。
//           ほかの保護者の端末で一覧が変わったときも、スイッチが古いまま残らない。
//   保存していない変更がある: 動かしかけのスイッチを戻さず、動かし始めたときの版を保つ（conflict で気づけるように）。
export function syncExcludedDraft(
  current: { saved: readonly ExcludedApp[] | null; draft: ReadonlySet<string> | null; baseVersion: number | null },
  view: Pick<ExcludedAppsView, "apps" | "configVersion">,
): { draft: ReadonlySet<string>; baseVersion: number } {
  const { saved, draft, baseVersion } = current;
  if (saved && draft && baseVersion != null && hasUnsaved(saved, draft)) return { draft, baseVersion };
  return { draft: new Set(view.apps.map((a) => a.packageName)), baseVersion: view.configVersion };
}
