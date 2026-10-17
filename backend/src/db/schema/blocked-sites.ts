import { sql } from "drizzle-orm";
import { check, integer, pgTable, primaryKey, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * 制限する Web サイト（docs/decisions.md D-111）。保護者が登録し、C7 の設定の組（blockedSites）で子どもの端末へ届く。
 * pattern は contracts/web-sites.ts の normalizeSitePattern でそろえた形（"youtube.com" か "youtube.com/shorts"）。
 * since_version はこの登録を足した設定の版（親の画面の「反映済み／反映待ち」）。外した登録は行を消す
 * （外したことが届いたかは、下の blocked_site_states の sites_changed_version で見る）。
 */
export const blockedSites = pgTable("blocked_sites", {
  childId: uuid("child_id").notNull().references(() => users.id),
  pattern: varchar("pattern", { length: 200 }).notNull(),
  sinceVersion: integer("since_version").notNull(),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: "blocked_sites_pk", columns: [table.childId, table.pattern] }),
  check("blocked_sites_pattern_not_blank", sql`length(trim(${table.pattern})) > 0`),
  check("blocked_sites_since_version_positive", sql`${table.sinceVersion} > 0`),
]);

/** 子ども1人に1行。一覧（足した・外した）が最後に変わった設定の版。行がない = 一度も変えていない（0） */
export const blockedSiteStates = pgTable("blocked_site_states", {
  childId: uuid("child_id").primaryKey().references(() => users.id),
  sitesChangedVersion: integer("sites_changed_version").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [check("blocked_site_states_version_nonnegative", sql`${table.sitesChangedVersion} >= 0`)]);
