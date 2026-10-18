import { boolean, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * 許可の見張りと親への通告（docs/decisions.md D-113）。子どもの端末の Kotlin（MonitorService）が送る「許可の状態」の最新。子ども1人に1行。
 * 行がない = まだ一度も届いていない（古いアプリ。親01 は何も出さない）。
 * 送られてくるのは許可ごとのオン/オフと測った時刻だけ（使用時間・アプリ名・URL は来ない）。
 *   *_off_since    : その許可がオフになった時刻（最初にオフと届いた報告の測った時刻）。オンなら null
 *   measured_at    : 今の状態を端末で測った時刻（これより古い報告が後から届いても、状態は書き換えない）
 *   last_seen_at   : サーバに最後に届いた時刻（サーバの時計。親01 の「30 分以上連絡が取れていません」に使う）
 * 連携を外したら行を消す（src/server/auth.ts の unlinkChild。次の保護者に前の様子を見せない）。
 */
export const deviceStatuses = pgTable("device_statuses", {
  childId: uuid("child_id").primaryKey().references(() => users.id),
  usageAccess: boolean("usage_access").notNull(),
  overlay: boolean("overlay").notNull(),
  notifications: boolean("notifications").notNull(),
  accessibility: boolean("accessibility").notNull(),
  usageAccessOffSince: timestamp("usage_access_off_since", { withTimezone: true }),
  overlayOffSince: timestamp("overlay_off_since", { withTimezone: true }),
  notificationsOffSince: timestamp("notifications_off_since", { withTimezone: true }),
  accessibilityOffSince: timestamp("accessibility_off_since", { withTimezone: true }),
  measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
});
