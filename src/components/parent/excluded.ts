// 親16 制限対象外アプリの管理 の行の中身（純粋な関数。tests/parent/excluded.test.ts）。
// 「反映済み／反映待ち」（Q6）: 子どもの端末が使っている版（childAppliedVersion）と、その変更が入った版を比べる。
//   対象外にしたアプリ : sinceVersion（対象外になった版）が子どもの版以下なら反映済み
//   対象外から外したアプリ: 外した版が分かれば同じように比べる。分からなければ反映済みとみなす
//     TODO(未決): 外した版はサーバの応答（ExcludedAppsView）にないので、この画面で保存した外し方だけを覚えて比べている。
//     アプリを開き直すと分からなくなる（共有ファイルへの依頼: 対象外アプリの一覧が最後に変わった版を返してほしい）
//   スイッチを動かしてまだ保存していない行は「未保存」
// 候補の一覧は TODO(保留): Q15（子どもの端末のアプリ一覧の得かたは保留）。MOCK の候補＋保存済みのアプリを並べる。
import type { ExcludedApp, ExcludedAppInput } from "@contracts/schemas";
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
  removedAt: ReadonlyMap<string, number>; // この画面で対象外から外して保存したアプリと、その版
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
