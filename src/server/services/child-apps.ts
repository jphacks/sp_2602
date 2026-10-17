// Q15（docs/decisions.md D-110）: 子どもの端末のアプリ一覧（親16 の候補）とアイコン（親09・親16）。
//   子ども : 一覧を送る（全件の置き換え）・アイコンを送る。保存先は認証した本人（入力の childId は route.ts が本人と一致することを確かめ済み）
//   保護者 : 連携している子どもの一覧・アイコンを読む（route.ts と DB の処理の両方で連携を確かめる）
import { createHash } from "node:crypto";
import {
  readChildAppIconsForParent,
  readChildAppsForParent,
  replaceChildApps,
  saveChildAppIcons,
} from "../../../backend/src/db/child-apps.js";
import { ParentChildLinkRequiredError } from "../../../backend/src/db/family-errors.js";
import {
  type ChildApp,
  type ChildAppIcon,
  type ChildAppIconsUploadResult,
  type ChildAppIconsView,
  type ChildAppsUploadResult,
  type ChildAppsView,
  MAX_APP_ICON_BYTES,
} from "../../../contracts/schemas.js";
import type { Caller } from "../auth.js";
import { db } from "../db/index.js";
import { AppError } from "../errors.js";

// 表示名の順（日本語の並べ方。同じ名前なら packageName の順）。DB の照合順序（環境で変わる）に任せない
const collator = new Intl.Collator("ja");
export function sortByLabel<T extends { packageName: string; label: string }>(apps: readonly T[]): T[] {
  return [...apps].sort(
    (a, b) =>
      collator.compare(a.label, b.label) ||
      (a.packageName < b.packageName ? -1 : a.packageName > b.packageName ? 1 : 0),
  );
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// アイコンの中身を確かめる: base64 が読める・PNG の頭・20KB 以下・送られたハッシュが中身の SHA-256 と同じ。
// なぜ: 保護者の端末はこの中身をそのまま画像として出すので、PNG でないもの・大きすぎるもの・ハッシュの合わないもの
//   （ハッシュで「変わっていない」と見なして読み直さなくなる）を保存しない
export function checkIconPng(icon: Pick<ChildAppIcon, "iconHash" | "png">): string | null {
  const bytes = Buffer.from(icon.png, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== icon.png) return "アイコンの base64 が正しくありません";
  if (bytes.length > MAX_APP_ICON_BYTES) return "アイコンが大きすぎます";
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE))
    return "アイコンが PNG ではありません";
  if (createHash("sha256").update(bytes).digest("hex") !== icon.iconHash) return "アイコンのハッシュが中身と合いません";
  return null;
}

export async function uploadChildAppsForChild(
  caller: Caller,
  apps: readonly ChildApp[],
): Promise<ChildAppsUploadResult> {
  const receivedAt = new Date();
  const { appCount, iconsNeeded } = await replaceChildApps(await db(), {
    childId: caller.userId,
    apps: apps.map((a) => ({ appId: a.packageName, label: a.label, iconHash: a.iconHash })),
    receivedAt,
  });
  return { appCount, receivedAt: receivedAt.toISOString(), iconsNeeded };
}

export async function uploadChildAppIconsForChild(
  caller: Caller,
  icons: readonly ChildAppIcon[],
): Promise<ChildAppIconsUploadResult> {
  for (const icon of icons) {
    const problem = checkIconPng(icon);
    if (problem) throw new AppError("bad_request", `${problem}（${icon.packageName}）`);
  }
  return saveChildAppIcons(await db(), {
    childId: caller.userId,
    icons: icons.map((i) => ({ appId: i.packageName, iconHash: i.iconHash, png: i.png })),
    updatedAt: new Date(),
  });
}

function linkError(error: unknown): never {
  if (error instanceof ParentChildLinkRequiredError) throw new AppError("forbidden");
  throw error;
}

export async function getChildAppsForParent(caller: Caller, childId: string): Promise<ChildAppsView> {
  try {
    const snapshot = await readChildAppsForParent(await db(), { parentId: caller.userId, childId });
    return {
      childId,
      apps: sortByLabel(
        snapshot.apps.map((a) => ({ packageName: a.appId, label: a.label, iconHash: a.iconHash ?? null })),
      ),
      receivedAt: snapshot.receivedAt?.toISOString() ?? null,
    };
  } catch (error) {
    linkError(error);
  }
}

export async function getChildAppIconsForParent(
  caller: Caller,
  input: { childId: string; packageNames: readonly string[] },
): Promise<ChildAppIconsView> {
  try {
    const icons = await readChildAppIconsForParent(await db(), {
      parentId: caller.userId,
      childId: input.childId,
      appIds: [...new Set(input.packageNames)],
    });
    return {
      childId: input.childId,
      icons: icons.map((i) => ({ packageName: i.appId, iconHash: i.iconHash, png: i.png })),
    };
  } catch (error) {
    linkError(error);
  }
}
