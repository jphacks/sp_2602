import { and, eq } from "drizzle-orm";
import type { Database } from "./index.js";
import { childConfigVersions, familyLinks } from "./schema/family.js";
import { excludedApps } from "./schema/excluded-apps.js";
import { ParentChildLinkRequiredError } from "./family-errors.js";

export interface ReplaceExcludedAppsInput {
  /** Must come from the authenticated caller context, not an untrusted request field. */
  parentId: string;
  childId: string;
  appIds: readonly string[];
}

export interface ReplaceExcludedAppsResult {
  configVersion: number;
  changed: boolean;
  enabledAppIds: string[];
}

export class InvalidExcludedAppsError extends Error {
  readonly code = "invalid_excluded_apps";

  constructor() {
    super("Excluded app IDs must be unique, nonblank strings of at most 255 characters.");
    this.name = "InvalidExcludedAppsError";
  }
}

function validateAppIds(appIds: readonly string[]): string[] {
  if (appIds.some((appId) => appId.trim().length === 0 || appId.length > 255)) {
    throw new InvalidExcludedAppsError();
  }
  const uniqueIds = new Set(appIds);
  if (uniqueIds.size !== appIds.length) throw new InvalidExcludedAppsError();
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
  const desiredAppIds = validateAppIds(input.appIds);

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
      .values({ childId: input.childId, version: 1 })
      .onConflictDoNothing({ target: childConfigVersions.childId });

    const [config] = await tx
      .select({ version: childConfigVersions.version })
      .from(childConfigVersions)
      .where(eq(childConfigVersions.childId, input.childId))
      .limit(1)
      .for("update");
    if (!config) throw new Error("Config version row was not available after initialization.");

    const currentlyEnabled = await tx
      .select({ appId: excludedApps.appId })
      .from(excludedApps)
      .where(and(
        eq(excludedApps.childId, input.childId),
        eq(excludedApps.enabled, true),
      ))
      .orderBy(excludedApps.appId);
    const currentAppIds = currentlyEnabled.map((row) => row.appId);
    const changed = currentAppIds.length !== desiredAppIds.length
      || currentAppIds.some((appId, index) => appId !== desiredAppIds[index]);

    if (!changed) {
      return {
        configVersion: config.version,
        changed: false,
        enabledAppIds: currentAppIds,
      };
    }

    const nextVersion = config.version + 1;
    const updatedAt = new Date();
    await tx
      .update(childConfigVersions)
      .set({ version: nextVersion, updatedAt })
      .where(eq(childConfigVersions.childId, input.childId));

    await tx
      .update(excludedApps)
      .set({ enabled: false, updatedByUserId: input.parentId, updatedAt })
      .where(eq(excludedApps.childId, input.childId));

    if (desiredAppIds.length > 0) {
      await tx
        .insert(excludedApps)
        .values(desiredAppIds.map((appId) => ({
          childId: input.childId,
          appId,
          enabled: true,
          updatedByUserId: input.parentId,
          updatedAt,
        })))
        .onConflictDoUpdate({
          target: [excludedApps.childId, excludedApps.appId],
          set: {
            enabled: true,
            updatedByUserId: input.parentId,
            updatedAt,
          },
        });
    }

    return {
      configVersion: nextVersion,
      changed: true,
      enabledAppIds: desiredAppIds,
    };
  });
}
