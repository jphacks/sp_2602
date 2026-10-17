// 親16 制限対象外アプリの管理 の行の中身（純粋な関数。tests/parent/excluded.test.ts）。
// 「反映済み／反映待ち」（Q6）: 子どもの端末が使っている版（childAppliedVersion）と、その変更が入った版を比べる。
//   対象外にしたアプリ : sinceVersion（対象外になった版）が子どもの版以下なら反映済み
//   対象外から外したアプリ: サーバの removedApps の removedVersion（外した版）で同じように比べる
//   一度も対象外になっていないアプリ: 子どもの端末の扱いは変わっていないので反映済み
//   （どれもサーバの値だけで決まるので、画面を開き直しても正しく出る）
//   一覧の全体: appsChangedVersion（一覧が最後に変わった版）が子どもの版以下なら反映済み（画面の上の札）
//   スイッチを動かしてまだ保存していない行は「未保存」
// 候補の一覧は TODO(保留): Q15（子どもの端末のアプリ一覧の得かたは保留）。MOCK の候補＋保存済みのアプリを並べる。
import type { ExcludedApp, ExcludedAppInput, ExcludedAppsView, RemovedExcludedApp } from "@contracts/schemas";
import { reflectState } from "./plan-form";

export type RowStatus = "applied" | "pending" | "unsaved";

export type ExcludedRow = {
  packageName: string;
  label: string;
  initial: string;
  on: boolean; // 画面のスイッチ（対象外にするか）
  status: RowStatus;
};

// 並べる候補: MOCK の候補の順に、保存済みだが候補にないアプリを後ろに足す（保存済みのものが画面から消えないように）
export function candidateApps(
  candidates: readonly ExcludedAppInput[],
  saved: readonly ExcludedApp[],
): ExcludedAppInput[] {
  const known = new Set(candidates.map((c) => c.packageName));
  return [
    ...candidates,
    ...saved.filter((a) => !known.has(a.packageName)).map((a) => ({ packageName: a.packageName, label: a.label })),
  ];
}

export function excludedRows(input: {
  candidates: readonly ExcludedAppInput[];
  saved: readonly ExcludedApp[]; // サーバに保存されている対象外アプリ
  draft: ReadonlySet<string>; // 画面のスイッチが ON のアプリ（packageName）
  childAppliedVersion: number | null;
  removedAt: ReadonlyMap<string, number>; // 対象外から外したアプリと、外した版（removedVersions(view.removedApps)）
}): ExcludedRow[] {
  const savedBy = new Map(input.saved.map((a) => [a.packageName, a]));
  return candidateApps(input.candidates, input.saved).map((c) => {
    const savedApp = savedBy.get(c.packageName);
    const on = input.draft.has(c.packageName);
    let status: RowStatus;
    if (on !== !!savedApp) status = "unsaved";
    else if (savedApp) status = reflectState(input.childAppliedVersion, savedApp.sinceVersion);
    else {
      const removed = input.removedAt.get(c.packageName);
      status = removed == null ? "applied" : reflectState(input.childAppliedVersion, removed);
    }
    return { packageName: c.packageName, label: c.label, initial: Array.from(c.label)[0] ?? "?", on, status };
  });
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
  candidates: readonly ExcludedAppInput[],
  saved: readonly ExcludedApp[],
  draft: ReadonlySet<string>,
): ExcludedAppInput[] {
  return candidateApps(candidates, saved)
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
