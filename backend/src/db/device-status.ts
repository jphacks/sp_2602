// 許可の見張りと親への通告（docs/decisions.md D-113）: 子どもの端末の許可の状態の保存と読み出し。
// 送られてくるのは許可ごとのオン/オフと測った時刻だけ。設定の版（child_config_versions）は上げない（親の設定ではないので）。
import { and, eq } from "drizzle-orm";
import { ParentChildLinkRequiredError } from "./family-errors.js";
import type { Database } from "./index.js";
import { deviceStatuses } from "./schema/device-status.js";
import { familyLinks } from "./schema/family.js";

/** 見張る許可（contracts/schemas.ts の DevicePermissionKey と同じ名前・同じ順）。 */
export const DEVICE_PERMISSIONS = ["usageAccess", "overlay", "notifications", "accessibility"] as const;
export type DevicePermission = (typeof DEVICE_PERMISSIONS)[number];
export type DevicePermissionFlags = Record<DevicePermission, boolean>;

export interface DeviceStatusRecord {
  permissions: Record<DevicePermission, { enabled: boolean; offSince: Date | null }>;
  measuredAt: Date;
  lastSeenAt: Date;
}

const offSinceColumn = {
  usageAccess: "usageAccessOffSince",
  overlay: "overlayOffSince",
  notifications: "notificationsOffSince",
  accessibility: "accessibilityOffSince",
} as const satisfies Record<DevicePermission, keyof typeof deviceStatuses.$inferSelect>;

type Row = typeof deviceStatuses.$inferSelect;

/**
 * 前の行と新しい報告から、保存する行を作る（純粋な関数。tests/server/device-status.test.ts）。
 *   - 報告の measuredAt が前の行より古い（遅れて届いた）なら、状態は変えず lastSeenAt だけ進める
 *   - オフの許可: 前もオフなら offSince はそのまま、前はオン（または行がない）なら今回の measuredAt
 *   - オンの許可: offSince は null
 */
export function nextDeviceStatusRow(
  prev: Row | null,
  input: { childId: string; permissions: DevicePermissionFlags; measuredAt: Date; receivedAt: Date },
): Row {
  if (prev && input.measuredAt.getTime() < prev.measuredAt.getTime())
    return { ...prev, lastSeenAt: maxDate(prev.lastSeenAt, input.receivedAt) };
  const row: Row = {
    childId: input.childId,
    usageAccess: input.permissions.usageAccess,
    overlay: input.permissions.overlay,
    notifications: input.permissions.notifications,
    accessibility: input.permissions.accessibility,
    usageAccessOffSince: null,
    overlayOffSince: null,
    notificationsOffSince: null,
    accessibilityOffSince: null,
    measuredAt: input.measuredAt,
    lastSeenAt: prev ? maxDate(prev.lastSeenAt, input.receivedAt) : input.receivedAt,
  };
  for (const name of DEVICE_PERMISSIONS) {
    if (input.permissions[name]) continue;
    const wasOff = prev != null && !prev[name];
    row[offSinceColumn[name]] = wasOff ? (prev[offSinceColumn[name]] ?? input.measuredAt) : input.measuredAt;
  }
  return row;
}

const maxDate = (a: Date, b: Date) => (a.getTime() >= b.getTime() ? a : b);

/**
 * 子どもの端末から届いた許可の状態を保存する。childId は認証した本人（入力の値を信じない）。
 * 同じ子どもの報告が同時に届いても順に通すよう、行を押さえてから読み直して書く。
 */
export async function saveDeviceStatus(
  db: Database,
  input: { childId: string; permissions: DevicePermissionFlags; measuredAt: Date; receivedAt: Date },
): Promise<DeviceStatusRecord> {
  return db.transaction(async (tx) => {
    const [prev] = await tx
      .select()
      .from(deviceStatuses)
      .where(eq(deviceStatuses.childId, input.childId))
      .for("update")
      .limit(1);
    const row = nextDeviceStatusRow(prev ?? null, input);
    const { childId: _childId, ...values } = row;
    await tx.insert(deviceStatuses).values(row).onConflictDoUpdate({ target: deviceStatuses.childId, set: values });
    return toRecord(row);
  });
}

/**
 * 保護者が、連携している子どもの許可の状態を読む。まだ一度も届いていなければ null。
 * 連携していなければ ParentChildLinkRequiredError（入口の route.ts でも確かめているが、ここでも確かめる）。
 */
export async function readDeviceStatusForParent(
  db: Database,
  input: { parentId: string; childId: string },
): Promise<DeviceStatusRecord | null> {
  return db.transaction(async (tx) => {
    const [link] = await tx
      .select({ id: familyLinks.id })
      .from(familyLinks)
      .where(and(eq(familyLinks.parentId, input.parentId), eq(familyLinks.childId, input.childId)))
      .limit(1);
    if (!link) throw new ParentChildLinkRequiredError();
    const [row] = await tx.select().from(deviceStatuses).where(eq(deviceStatuses.childId, input.childId)).limit(1);
    return row ? toRecord(row) : null;
  });
}

function toRecord(row: Row): DeviceStatusRecord {
  const permissions = {} as DeviceStatusRecord["permissions"];
  for (const name of DEVICE_PERMISSIONS)
    permissions[name] = { enabled: row[name], offSince: row[name] ? null : row[offSinceColumn[name]] };
  return { permissions, measuredAt: row.measuredAt, lastSeenAt: row.lastSeenAt };
}
