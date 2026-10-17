import { check, foreignKey, index, integer, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users, userRole } from "./users.js";

export const familyLinks = pgTable("family_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  parentId: uuid("parent_id").notNull(),
  parentRole: userRole("parent_role").default("parent").notNull(),
  childId: uuid("child_id").notNull(),
  childRole: userRole("child_role").default("child").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("family_links_parent_child_unique").on(table.parentId, table.childId),
  index("family_links_child_idx").on(table.childId),
  check("family_links_parent_role_is_parent", sql`${table.parentRole} = 'parent'`),
  check("family_links_child_role_is_child", sql`${table.childRole} = 'child'`),
  foreignKey({
    name: "family_links_parent_role_fk",
    columns: [table.parentId, table.parentRole],
    foreignColumns: [users.id, users.role],
  }),
  foreignKey({
    name: "family_links_child_role_fk",
    columns: [table.childId, table.childRole],
    foreignColumns: [users.id, users.role],
  }),
  check("family_links_no_self_link", sql`${table.parentId} <> ${table.childId}`),
]);

export const childConfigVersions = pgTable("child_config_versions", {
  childId: uuid("child_id").primaryKey().references(() => users.id),
  version: integer("version").default(1).notNull(),
  /** Advances only when D3, D8, or blank-period inputs to C10 change. */
  c10InputVersion: integer("c10_input_version").default(1).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("child_config_versions_positive", sql`${table.version} > 0`),
  check("child_config_versions_c10_input_positive", sql`${table.c10InputVersion} > 0`),
]);
