// Q15（docs/decisions.md D-110）: 子どもの端末のアプリ一覧（親16 の候補）とアイコン（親09・親16）の保存と読み出し。
// 送るのは packageName・表示名・アイコンだけ。設定の版（child_config_versions）は上げない（親の設定ではなく、子どもの端末の様子なので）。
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { ParentChildLinkRequiredError } from "./family-errors.js";
import type { Database } from "./index.js";
import { childAppIcons, childAppListItems, childAppLists } from "./schema/child-apps.js";
import { familyLinks } from "./schema/family.js";

export interface ChildAppEntry {
  appId: string;
  label: string;
}

export interface ReplaceChildAppsInput {
  /** 呼んだ子ども本人の id（認証から取る。入力の childId をそのまま信じない）。 */
  childId: string;
  /** iconHash は端末が持っているアイコンの中身のハッシュ（作れなかったアプリは省く）。 */
  apps: readonly (ChildAppEntry & { iconHash?: string })[];
  receivedAt: Date;
}

// 1回の INSERT に入れる行の数（Postgres の1文の引数は 65535 個まで。1行 3 個なので余裕をもって 500 行ずつ）
const INSERT_CHUNK = 500;

/**
 * 子どもの端末のアプリ一覧を全件置き換える（差分ではない）。一覧から消えたアプリのアイコンも消す。
 * 先に「届いた」印の行を書いてから中身を消して入れ直す（印の行の鍵で、同じ子どもの同時の送信を1つずつ順に通すため。
 * 同時に消して入れると、同じアプリを2回入れようとして失敗する）。
 * 返す iconsNeeded: 端末がハッシュを送ってきたのに、サーバに同じ中身のアイコンがないアプリ（端末はこれだけを送る）。
 */
export async function replaceChildApps(
  db: Database,
  input: ReplaceChildAppsInput,
): Promise<{ appCount: number; iconsNeeded: string[] }> {
  return db.transaction(async (tx) => {
    await tx
      .insert(childAppLists)
      .values({ childId: input.childId, receivedAt: input.receivedAt })
      .onConflictDoUpdate({ target: childAppLists.childId, set: { receivedAt: input.receivedAt } });
    await tx.delete(childAppListItems).where(eq(childAppListItems.childId, input.childId));
    for (let i = 0; i < input.apps.length; i += INSERT_CHUNK) {
      const chunk = input.apps.slice(i, i + INSERT_CHUNK);
      await tx
        .insert(childAppListItems)
        .values(chunk.map((app) => ({ childId: input.childId, appId: app.appId, label: app.label })));
    }
    const appIds = input.apps.map((a) => a.appId);
    await tx
      .delete(childAppIcons)
      .where(
        appIds.length
          ? and(eq(childAppIcons.childId, input.childId), notInArray(childAppIcons.appId, appIds))
          : eq(childAppIcons.childId, input.childId),
      );
    const stored = await tx
      .select({ appId: childAppIcons.appId, iconHash: childAppIcons.iconHash })
      .from(childAppIcons)
      .where(eq(childAppIcons.childId, input.childId));
    const storedHash = new Map(stored.map((r) => [r.appId, r.iconHash]));
    const iconsNeeded = input.apps
      .filter((a) => a.iconHash && storedHash.get(a.appId) !== a.iconHash)
      .map((a) => a.appId);
    return { appCount: input.apps.length, iconsNeeded };
  });
}

export interface ChildAppIconInput {
  appId: string;
  iconHash: string;
  png: string;
}

/**
 * アイコンを保存する（同じアプリは上書き）。今の一覧にないアプリのアイコンは保存しない（どこにも出ない画像を溜めない）。
 * 中身（PNG であること・大きさ・ハッシュ）は呼ぶ側（src/server/services/child-apps.ts）が確かめてから渡す。
 */
export async function saveChildAppIcons(
  db: Database,
  input: { childId: string; icons: readonly ChildAppIconInput[]; updatedAt: Date },
): Promise<{ saved: number }> {
  if (input.icons.length === 0) return { saved: 0 };
  return db.transaction(async (tx) => {
    const listed = await tx
      .select({ appId: childAppListItems.appId })
      .from(childAppListItems)
      .where(
        and(
          eq(childAppListItems.childId, input.childId),
          inArray(
            childAppListItems.appId,
            input.icons.map((i) => i.appId),
          ),
        ),
      );
    const known = new Set(listed.map((r) => r.appId));
    const rows = input.icons
      .filter((i) => known.has(i.appId))
      .map((i) => ({
        childId: input.childId,
        appId: i.appId,
        iconHash: i.iconHash,
        png: i.png,
        updatedAt: input.updatedAt,
      }));
    if (rows.length === 0) return { saved: 0 };
    await tx
      .insert(childAppIcons)
      .values(rows)
      .onConflictDoUpdate({
        target: [childAppIcons.childId, childAppIcons.appId],
        set: {
          iconHash: sql`excluded.icon_hash`,
          png: sql`excluded.png`,
          updatedAt: input.updatedAt,
        },
      });
    return { saved: rows.length };
  });
}

async function assertLinked(tx: Pick<Database, "select">, parentId: string, childId: string): Promise<void> {
  const [link] = await tx
    .select({ id: familyLinks.id })
    .from(familyLinks)
    .where(and(eq(familyLinks.parentId, parentId), eq(familyLinks.childId, childId)))
    .limit(1);
  if (!link) throw new ParentChildLinkRequiredError();
}

export interface ChildAppsSnapshot {
  /** null = まだ一度も届いていない。 */
  receivedAt: Date | null;
  /** iconHash はサーバにあるアイコンのハッシュ（なければ null）。 */
  apps: (ChildAppEntry & { iconHash: string | null })[];
}

/**
 * 保護者が、連携している子どもの端末のアプリ一覧を読む。連携していなければ ParentChildLinkRequiredError
 * （入口の route.ts でも確かめているが、ここでも確かめる。対象外アプリの保存と同じ二重の確認）。
 * 並びは packageName の順（表示名の順に並べるのは呼ぶ側。文字の並べ方を DB の照合順序に任せないため）。
 */
export async function readChildAppsForParent(
  db: Database,
  input: { parentId: string; childId: string },
): Promise<ChildAppsSnapshot> {
  return db.transaction(async (tx) => {
    await assertLinked(tx, input.parentId, input.childId);
    const [list] = await tx
      .select({ receivedAt: childAppLists.receivedAt })
      .from(childAppLists)
      .where(eq(childAppLists.childId, input.childId))
      .limit(1);
    if (!list) return { receivedAt: null, apps: [] };
    const apps = await tx
      .select({ appId: childAppListItems.appId, label: childAppListItems.label, iconHash: childAppIcons.iconHash })
      .from(childAppListItems)
      .leftJoin(
        childAppIcons,
        and(eq(childAppIcons.childId, childAppListItems.childId), eq(childAppIcons.appId, childAppListItems.appId)),
      )
      .where(eq(childAppListItems.childId, input.childId))
      .orderBy(childAppListItems.appId);
    return { receivedAt: list.receivedAt, apps };
  });
}

/** 保護者が、連携している子どものアプリのアイコンを読む（頼んだアプリのうち、あるものだけ）。 */
export async function readChildAppIconsForParent(
  db: Database,
  input: { parentId: string; childId: string; appIds: readonly string[] },
): Promise<ChildAppIconInput[]> {
  return db.transaction(async (tx) => {
    await assertLinked(tx, input.parentId, input.childId);
    if (input.appIds.length === 0) return [];
    return tx
      .select({ appId: childAppIcons.appId, iconHash: childAppIcons.iconHash, png: childAppIcons.png })
      .from(childAppIcons)
      .where(and(eq(childAppIcons.childId, input.childId), inArray(childAppIcons.appId, [...input.appIds])))
      .orderBy(childAppIcons.appId);
  });
}
