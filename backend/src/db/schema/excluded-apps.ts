import { sql } from "drizzle-orm";
import { boolean, check, pgTable, primaryKey, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/** Parent-managed exclusions only; OS safety exceptions are deliberately separate. */
export const excludedApps = pgTable("excluded_apps", {
  childId: uuid("child_id").notNull().references(() => users.id),
  appId: varchar("app_id", { length: 255 }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: "excluded_apps_pk", columns: [table.childId, table.appId] }),
  check("excluded_apps_app_id_not_blank", sql`length(trim(${table.appId})) > 0`),
]);
