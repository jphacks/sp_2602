// 許可の見張りと親への通告（docs/decisions.md D-113）。
//   子ども : 端末の Kotlin（MonitorService）が許可の状態を送る。保存先は認証した本人（入力の childId は route.ts が本人と一致することを確かめ済み）
//   保護者 : 連携している子どもの状態を読む（route.ts と DB の処理の両方で連携を確かめる）
import {
  DEVICE_PERMISSIONS,
  type DeviceStatusRecord,
  readDeviceStatusForParent,
  saveDeviceStatus,
} from "../../../backend/src/db/device-status.js";
import { ParentChildLinkRequiredError } from "../../../backend/src/db/family-errors.js";
import type {
  ChildDeviceStatus,
  DeviceStatusReport,
  DeviceStatusReportResult,
  DeviceStatusView,
} from "../../../contracts/schemas.js";
import type { Caller } from "../auth.js";
import { db } from "../db/index.js";
import { AppError } from "../errors.js";

export async function reportDeviceStatus(caller: Caller, input: DeviceStatusReport): Promise<DeviceStatusReportResult> {
  const receivedAt = new Date();
  // 端末の時計が進んでいても、未来の時刻を「オフになった時刻」にしない
  const measured = new Date(Math.min(Date.parse(input.measuredAt), receivedAt.getTime()));
  await saveDeviceStatus(await db(), {
    childId: caller.userId,
    permissions: input.permissions,
    measuredAt: measured,
    receivedAt,
  });
  return { ok: true };
}

export async function getDeviceStatusForParent(caller: Caller, childId: string): Promise<DeviceStatusView> {
  try {
    const record = await readDeviceStatusForParent(await db(), { parentId: caller.userId, childId });
    return { status: record ? toStatus(record) : null };
  } catch (error) {
    if (error instanceof ParentChildLinkRequiredError) throw new AppError("forbidden");
    throw error;
  }
}

function toStatus(r: DeviceStatusRecord): ChildDeviceStatus {
  const permissions = {} as ChildDeviceStatus["permissions"];
  const offSince = {} as ChildDeviceStatus["offSince"];
  for (const name of DEVICE_PERMISSIONS) {
    permissions[name] = r.permissions[name].enabled;
    offSince[name] = r.permissions[name].offSince?.toISOString() ?? null;
  }
  return { permissions, offSince, measuredAt: r.measuredAt.toISOString(), lastSeenAt: r.lastSeenAt.toISOString() };
}
