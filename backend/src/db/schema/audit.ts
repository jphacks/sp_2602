import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * 破壊的な操作の監査記録（IPA-15）。誰が（actor）・いつ（created_at）・どの子どもに（child）・何を（action）したかだけを残す。
 * 今の action は "family_unlink"（保護者が子どもとの連携を外した。src/server/auth.ts の unlinkChild と同じトランザクションで書く）。
 * 消したデータの中身は残さない（残すと、連携を外したあとも前の家庭のデータが残ることになるため。F-2）。
 * 行は書き足すだけで、書き換え・削除はしない。
 */
export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  action: varchar("action", { length: 40 }).notNull(),
  actorUserId: uuid("actor_user_id").notNull().references(() => users.id),
  childId: uuid("child_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("audit_events_child_created_idx").on(table.childId, table.createdAt),
  index("audit_events_actor_created_idx").on(table.actorUserId, table.createdAt),
]);
