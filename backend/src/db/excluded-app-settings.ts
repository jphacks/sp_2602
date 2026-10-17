import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Database } from "./index.js";
import { childConfigVersions, familyLinks } from "./schema/family.js";
import { excludedApps } from "./schema/excluded-apps.js";
import { excludedAppStates, removedExcludedApps } from "./schema/settings-state.js";
import { ParentChildLinkRequiredError } from "./family-errors.js";

export interface ReplaceExcludedAppsInput {
  /** Must come from the authenticated caller context, not an untrusted request field. */
  parentId: string;
  childId: string;
  appIds: readonly { appId: string; label: string }[];
  /** Version observed by the caller; checked inside the replacement transaction. */
  expectedVersion?: number;
}

export class ExcludedAppsVersionConflictError extends Error {
  readonly code = "config_version_conflict";

  constructor() {
    super("The child configuration changed after it was read.");
    this.name = "ExcludedAppsVersionConflictError";
  }
}

export interface ReplaceExcludedAppsResult {
  configVersion: number;
  changed: boolean;
  enabledApps: Array<{ appId: string; label: string; sinceVersion: number }>;
}

export interface ExcludedAppsSnapshot {
  configVersion: number;
  appsChangedVersion: number;
  apps: Array<{ appId: string; label: string; sinceVersion: number }>;
  removedApps: Array<{ appId: string; label: string; removedVersion: number }>;
}

export class InvalidExcludedAppsError extends Error {
  readonly code = "invalid_excluded_apps";

  constructor() {
    super("Excluded app IDs must be unique, nonblank strings of at most 255 characters.");
    this.name = "InvalidExcludedAppsError";
  }
}

function validateAppIds(appIds: readonly { appId: string; label: string }[]): string[] {
  if (appIds.some(({ appId, label }) => appId.trim().length === 0 || appId.length > 255
    || label.trim().length === 0 || label.length > 120)) {
    throw new InvalidExcludedAppsError();
  }
  const appIdsOnly = appIds.map((app) => app.appId);
  const uniqueIds = new Set(appIdsOnly);
  if (uniqueIds.size !== appIdsOnly.length) throw new InvalidExcludedAppsError();
  return [...uniqueIds].sort();
}

/**
 * Replace a child's active C9 exclusions. The authenticated parent-child edge is checked
 * in the same transaction, and the shared config version advances atomically with changes.
 */
export async function replaceExcludedAppsForParent(
  db: Database,
  input: ReplaceExcludedAppsInput,
): Promise<ReplaceExcludedAppsResult> {
  const desiredAppIds = validateAppIds(input.appIds).sort();
  const desiredApps = new Map(input.appIds.map((app) => [app.appId, app]));

  return db.transaction(async (tx) => {
    const [link] = await tx
      .select({ id: familyLinks.id })
      .from(familyLinks)
      .where(and(
        eq(familyLinks.parentId, input.parentId),
        eq(familyLinks.childId, input.childId),
      ))
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
    if (input.expectedVersion !== undefined && config.version !== input.expectedVersion) {
      throw new ExcludedAppsVersionConflictError();
    }

    const currentlyEnabled = await tx
      .select({ appId: excludedApps.appId, label: excludedApps.label, sinceVersion: excludedApps.sinceVersion })
      .from(excludedApps)
      .where(and(
        eq(excludedApps.childId, input.childId),
        eq(excludedApps.enabled, true),
      ))
      .orderBy(excludedApps.appId);
    const currentAppIds = currentlyEnabled.map((row) => row.appId);
    const changed = currentAppIds.length !== desiredAppIds.length
      || currentAppIds.some((appId, index) => appId !== desiredAppIds[index])
      || currentlyEnabled.some((row) => desiredApps.get(row.appId)?.label !== row.label);

    if (!changed) {
      return {
        configVersion: config.version,
        changed: false,
        enabledApps: currentlyEnabled,
      };
    }

    const nextVersion = config.version + 1;
    const updatedAt = new Date();
    await tx
      .update(childConfigVersions)
      .set({ version: nextVersion, updatedAt })
      .where(eq(childConfigVersions.childId, input.childId));

    const currentById = new Map(currentlyEnabled.map((row) => [row.appId, row]));
    const removed = currentlyEnabled.filter((row) => !desiredApps.has(row.appId));
    if (removed.length) {
      await tx.insert(removedExcludedApps).values(removed.map((row) => ({
        childId: input.childId,
        appId: row.appId,
        label: row.label,
        removedVersion: nextVersion,
        updatedAt,
      }))).onConflictDoUpdate({
        target: [removedExcludedApps.childId, removedExcludedApps.appId],
        set: { label: sql`excluded.label`, removedVersion: nextVersion, updatedAt },
      });
    }

    await tx
      .update(excludedApps)
      .set({ enabled: false, updatedByUserId: input.parentId, updatedAt })
      .where(desiredAppIds.length
        ? and(eq(excludedApps.childId, input.childId), notInArray(excludedApps.appId, desiredAppIds))
        : eq(excludedApps.childId, input.childId));

    if (input.appIds.length > 0) {
      await tx
        .insert(excludedApps)
        .values(input.appIds.map((app) => ({
          childId: input.childId,
          appId: app.appId,
          label: app.label,
          sinceVersion: currentById.get(app.appId)?.sinceVersion ?? nextVersion,
          enabled: true,
          updatedByUserId: input.parentId,
          updatedAt,
        })))
        .onConflictDoUpdate({
          target: [excludedApps.childId, excludedApps.appId],
          set: {
            label: sql`excluded.label`,
            sinceVersion: sql`excluded.since_version`,
            enabled: true,
            updatedByUserId: input.parentId,
            updatedAt,
          },
        });
      await tx.delete(removedExcludedApps)
        .where(and(
          eq(removedExcludedApps.childId, input.childId),
          inArray(removedExcludedApps.appId, desiredAppIds),
        ));
    }

    await tx.insert(excludedAppStates).values({ childId: input.childId, appsChangedVersion: nextVersion, updatedAt })
      .onConflictDoUpdate({
        target: excludedAppStates.childId,
        set: { appsChangedVersion: nextVersion, updatedAt },
      });

    return {
      configVersion: nextVersion,
      changed: true,
      enabledApps: input.appIds.map((app) => ({
        appId: app.appId,
        label: app.label,
        sinceVersion: currentById.get(app.appId)?.sinceVersion ?? nextVersion,
      })),
    };
  });
}

/** Read C9 app values with their server-owned version metadata. */
export async function readExcludedAppsSnapshot(db: Database, childId: string): Promise<ExcludedAppsSnapshot> {
  return db.transaction(async (tx) => {
    const [config] = await tx.select({ version: childConfigVersions.version })
      .from(childConfigVersions).where(eq(childConfigVersions.childId, childId)).limit(1);
    const [state] = await tx.select({ appsChangedVersion: excludedAppStates.appsChangedVersion })
      .from(excludedAppStates).where(eq(excludedAppStates.childId, childId)).limit(1);
    const apps = await tx.select({ appId: excludedApps.appId, label: excludedApps.label, sinceVersion: excludedApps.sinceVersion })
      .from(excludedApps).where(and(eq(excludedApps.childId, childId), eq(excludedApps.enabled, true)))
      .orderBy(excludedApps.appId);
    const removedApps = await tx.select({ appId: removedExcludedApps.appId, label: removedExcludedApps.label, removedVersion: removedExcludedApps.removedVersion })
      .from(removedExcludedApps).where(eq(removedExcludedApps.childId, childId))
      .orderBy(removedExcludedApps.appId);
    return {
      configVersion: config?.version ?? 0,
      appsChangedVersion: state?.appsChangedVersion ?? 0,
      apps,
      removedApps,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
