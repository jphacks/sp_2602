// 制限する Web サイト（parent/blocked-sites.tsx。D-111）の中身の決め方（純粋な関数。tests/parent/blocked-sites.test.ts）。
// 親16（excluded.ts）と同じ考え方:
//   「反映済み／反映待ち」（Q6）: 子どもの端末が使っている版（childAppliedVersion）と、その登録を足した版（sinceVersion）を比べる。
//     一覧の全体: sitesChangedVersion（足した・外したが最後にあった版）が子どもの版以下なら反映済み（見出しの横の札）
//     まだ保存していない行は「まだ保存していません」（足した行）・「外します（まだ保存していません）」（外した行）
//   取り直し（30 秒ごと）で、保存していない変更がなければサーバの今の一覧と版に合わせ直す（syncSitesDraft）
// 入力は contracts/web-sites.ts の normalizeSitePattern で、保存の前にそろえる（サーバも同じ規則で確かめる）。
import type { BlockedSite, BlockedSitesView } from "@contracts/schemas";
import { MAX_BLOCKED_SITES, normalizeSitePattern } from "@contracts/web-sites";
import { reflectState } from "./plan-form";

export type SiteRowStatus = "applied" | "pending" | "unsaved" | "removing";

export type SiteRow = {
  pattern: string;
  status: SiteRowStatus;
  scope: string; // 何を止めるか（「サイト全体」「/shorts から始まるページだけ」）
};

// 何を止める登録かの短い説明（保護者が登録の意味を取り違えないように）
export function siteScope(pattern: string): string {
  const slash = pattern.indexOf("/");
  if (slash < 0) return "サイト全体（サブドメインもふくむ）";
  return `${pattern.slice(slash)} から始まるページだけ`;
}

// 画面に並べる行: 今の下書き（入れた順）＋保存済みで下書きから外したもの（「外します」。戻せるように残す）
export function siteRows(input: {
  saved: readonly BlockedSite[];
  draft: readonly string[];
  childAppliedVersion: number | null;
}): SiteRow[] {
  const savedBy = new Map(input.saved.map((s) => [s.pattern, s]));
  const inDraft = new Set(input.draft);
  const rows: SiteRow[] = input.draft.map((pattern) => {
    const saved = savedBy.get(pattern);
    return {
      pattern,
      status: saved ? reflectState(input.childAppliedVersion, saved.sinceVersion) : "unsaved",
      scope: siteScope(pattern),
    };
  });
  for (const s of input.saved) {
    if (!inDraft.has(s.pattern)) rows.push({ pattern: s.pattern, status: "removing", scope: siteScope(s.pattern) });
  }
  return rows;
}

// 入力欄の文字を下書きに足す。そろえられない・もう入っている・数の上限は、分かる文で断る（入力欄の下に出す）
export function addSite(
  draft: readonly string[],
  input: string,
): { ok: true; draft: string[]; pattern: string } | { ok: false; message: string } {
  const r = normalizeSitePattern(input);
  if (!r.ok) return r;
  if (draft.includes(r.pattern)) return { ok: false, message: `${r.pattern} はもう入っています` };
  if (draft.length >= MAX_BLOCKED_SITES) {
    return { ok: false, message: `登録できるのは ${MAX_BLOCKED_SITES} 件までです。使わないものを外してください` };
  }
  return { ok: true, draft: [...draft, r.pattern], pattern: r.pattern };
}

export function removeSite(draft: readonly string[], pattern: string): string[] {
  return draft.filter((p) => p !== pattern);
}

// 外しかけた保存済みの登録を戻す（後ろに足す）
export function restoreSite(draft: readonly string[], pattern: string): string[] {
  return draft.includes(pattern) ? [...draft] : [...draft, pattern];
}

// まだ保存していない変更があるか（順番は比べない。サーバは組で保存する）
export function hasUnsavedSites(saved: readonly BlockedSite[], draft: readonly string[]): boolean {
  if (saved.length !== draft.length) return true;
  const set = new Set(draft);
  return saved.some((s) => !set.has(s.pattern));
}

// 一覧の全体が子どもの端末に届いているか（見出しの横の札）。一度も変えていなければ（版 0）届いている
export function sitesListStatus(
  view: Pick<BlockedSitesView, "sitesChangedVersion" | "childAppliedVersion">,
): "applied" | "pending" {
  if (view.sitesChangedVersion === 0) return "applied";
  return reflectState(view.childAppliedVersion, view.sitesChangedVersion);
}

// 30 秒ごとの取り直しで、下書きと保存に使う版（expectedVersion）をどうするか（親16 の syncExcludedDraft と同じ決まり）。
//   保存していない変更がない: サーバの今の一覧と版に合わせ直す（ほかの設定が変わって版が上がっても、最初の保存が conflict にならない）
//   保存していない変更がある: 下書きを戻さず、触り始めたときの版を保つ（ほかの端末が先に変えたら conflict で気づける）
export function syncSitesDraft(
  current: { saved: readonly BlockedSite[] | null; draft: readonly string[] | null; baseVersion: number | null },
  view: Pick<BlockedSitesView, "sites" | "configVersion">,
): { draft: string[]; baseVersion: number } {
  const { saved, draft, baseVersion } = current;
  if (saved && draft && baseVersion != null && hasUnsavedSites(saved, draft)) return { draft: [...draft], baseVersion };
  return { draft: view.sites.map((s) => s.pattern), baseVersion: view.configVersion };
}
