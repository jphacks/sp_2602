// 制限する Web サイト（docs/decisions.md D-111）の保存と読み出し。対象外アプリ（excluded-app-settings.ts）と同じ作り:
//   - 保存は全件の置き換え。保護者と子どもの連携・版の確かめ・版を 1 上げる・一覧を入れ替えるまでを1回のトランザクションで行う
//   - 中身が変わらなければ版を上げない（親の画面が意味なく「反映待ち」にならないように）
//   - 足した登録は sinceVersion = 新しい版、もとからある登録は前の sinceVersion のまま。外した登録は行を消す
//   - 一覧が変わった版（sitesChangedVersion）を blocked_site_states に残す（外したことが子どもの端末に届いたかを出すため）
// 登録の形（normalizeSitePattern でそろえた形か）は API の入口（contracts/schemas.ts の SitePattern）で確かめる。ここでは空・長さ・重複だけ。
import { and, eq, notInArray } from "drizzle-orm";
import type { Database } from "./index.js";
import { ParentChildLinkRequiredError } from "./family-errors.js";
import { blockedSiteStates, blockedSites } from "./schema/blocked-sites.js";
import { childConfigVersions, familyLinks } from "./schema/family.js";

export class BlockedSitesVersionConflictError extends Error {
  readonly code = "config_version_conflict";

  constructor() {
    super("The child configuration changed after it was read.");
    this.name = "BlockedSitesVersionConflictError";
  }
}

export class InvalidBlockedSitesError extends Error {
  readonly code = "invalid_blocked_sites";

  constructor() {
    super("Blocked site patterns must be unique, nonblank strings of at most 200 characters.");
    this.name = "InvalidBlockedSitesError";
  }
}

export interface BlockedSiteRow {
  pattern: string;
  sinceVersion: number;
}

export interface ReplaceBlockedSitesInput {
  /** 認証した呼び手（リクエストの値ではない） */
  parentId: string;
  childId: string;
  /** 保存後の全件 */
  patterns: readonly string[];
  /** 画面が読んだときの版。トランザクションの中で確かめる */
  expectedVersion: number;
}

export interface ReplaceBlockedSitesResult {
  configVersion: number;
  sitesChangedVersion: number;
  changed: boolean;
  sites: BlockedSiteRow[];
}

export interface BlockedSitesSnapshot {
  configVersion: number;
  sitesChangedVersion: number;
  sites: BlockedSiteRow[];
}

function validate(patterns: readonly string[]): void {
  if (patterns.some((p) => p.trim().length === 0 || p.length > 200)) throw new InvalidBlockedSitesError();
  if (new Set(patterns).size !== patterns.length) throw new InvalidBlockedSitesError();
}

// 並べる順: 登録した版の古い順、同じ版なら文字の順（画面・C7 でいつも同じ順になるように）
export const orderedBlockedSites = (rows: BlockedSiteRow[]) =>
  [...rows].sort((a, b) => a.sinceVersion - b.sinceVersion || (a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : 0));

export async function replaceBlockedSitesForParent(
  db: Database,
  input: ReplaceBlockedSitesInput,
): Promise<ReplaceBlockedSitesResult> {
  validate(input.patterns);

  return db.transaction(async (tx) => {
    const [link] = await tx
      .select({ id: familyLinks.id })
      .from(familyLinks)
      .where(and(eq(familyLinks.parentId, input.parentId), eq(familyLinks.childId, input.childId)))
      .limit(1)
      .for("key share");
    if (!link) throw new ParentChildLinkRequiredError();

    await tx
      .insert(childConfigVersions)
      .values({ childId: input.childId, version: 0 })
      .onConflictDoNothing({ target: childConfigVersions.childId });
    const [config] = await tx
      .select({ version: childConfigVersions.version })
      .from(childConfigVersions)
      .where(eq(childConfigVersions.childId, input.childId))
      .limit(1)
      .for("update");
    if (!config) throw new Error("Config version row was not available after initialization.");
    if (config.version !== input.expectedVersion) throw new BlockedSitesVersionConflictError();

    const current = await tx
      .select({ pattern: blockedSites.pattern, sinceVersion: blockedSites.sinceVersion })
      .from(blockedSites)
      .where(eq(blockedSites.childId, input.childId));
    const [state] = await tx
      .select({ sitesChangedVersion: blockedSiteStates.sitesChangedVersion })
      .from(blockedSiteStates)
      .where(eq(blockedSiteStates.childId, input.childId))
      .limit(1);
    const currentBy = new Map(current.map((row) => [row.pattern, row]));
    const desired = new Set(input.patterns);
    const changed = current.length !== desired.size || current.some((row) => !desired.has(row.pattern));
    if (!changed) {
      return {
        configVersion: config.version,
        sitesChangedVersion: state?.sitesChangedVersion ?? 0,
        changed: false,
        sites: orderedBlockedSites(current),
      };
    }

    const nextVersion = config.version + 1;
    const updatedAt = new Date();
    await tx
      .update(childConfigVersions)
      .set({ version: nextVersion, updatedAt })
      .where(eq(childConfigVersions.childId, input.childId));

    await tx
      .delete(blockedSites)
      .where(
        input.patterns.length
          ? and(eq(blockedSites.childId, input.childId), notInArray(blockedSites.pattern, [...input.patterns]))
          : eq(blockedSites.childId, input.childId),
      );
    const added = input.patterns.filter((p) => !currentBy.has(p));
    if (added.length) {
      await tx.insert(blockedSites).values(
        added.map((pattern) => ({
          childId: input.childId,
          pattern,
          sinceVersion: nextVersion,
          updatedByUserId: input.parentId,
          updatedAt,
        })),
      );
    }
    await tx
      .insert(blockedSiteStates)
      .values({ childId: input.childId, sitesChangedVersion: nextVersion, updatedAt })
      .onConflictDoUpdate({ target: blockedSiteStates.childId, set: { sitesChangedVersion: nextVersion, updatedAt } });

    return {
      configVersion: nextVersion,
      sitesChangedVersion: nextVersion,
      changed: true,
      sites: orderedBlockedSites(input.patterns.map((pattern) => currentBy.get(pattern) ?? { pattern, sinceVersion: nextVersion })),
    };
  });
}

/** 一覧と版を1回の読み取りでそろえて読む（版と中身が食い違わないように） */
export async function readBlockedSitesSnapshot(db: Database, childId: string): Promise<BlockedSitesSnapshot> {
  return db.transaction(
    async (tx) => {
      const [config] = await tx
        .select({ version: childConfigVersions.version })
        .from(childConfigVersions)
        .where(eq(childConfigVersions.childId, childId))
        .limit(1);
      const [state] = await tx
        .select({ sitesChangedVersion: blockedSiteStates.sitesChangedVersion })
        .from(blockedSiteStates)
        .where(eq(blockedSiteStates.childId, childId))
        .limit(1);
      const sites = await tx
        .select({ pattern: blockedSites.pattern, sinceVersion: blockedSites.sinceVersion })
        .from(blockedSites)
        .where(eq(blockedSites.childId, childId));
      return {
        configVersion: config?.version ?? 0,
        sitesChangedVersion: state?.sitesChangedVersion ?? 0,
        sites: orderedBlockedSites(sites),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
