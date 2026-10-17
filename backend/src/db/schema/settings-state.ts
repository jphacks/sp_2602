import { check, date, integer, pgTable, primaryKey, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const blankPeriods = pgTable("blank_periods", {
  id: uuid("id").defaultRandom().primaryKey(),
  childId: uuid("child_id").notNull().references(() => users.id),
  name: varchar("name", { length: 120 }).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("blank_periods_name_not_blank", sql`length(trim(${table.name})) > 0`),
  check("blank_periods_end_not_before_start", sql`${table.endDate} >= ${table.startDate}`),
]);

export const removedExcludedApps = pgTable("removed_excluded_apps", {
  childId: uuid("child_id").notNull().references(() => users.id),
  appId: varchar("app_id", { length: 255 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  removedVersion: integer("removed_version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: "removed_excluded_apps_pk", columns: [table.childId, table.appId] }),
  check("removed_excluded_apps_version_positive", sql`${table.removedVersion} > 0`),
]);

export const excludedAppStates = pgTable("excluded_app_states", {
  childId: uuid("child_id").primaryKey().references(() => users.id),
  appsChangedVersion: integer("apps_changed_version").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [check("excluded_app_states_version_nonnegative", sql`${table.appsChangedVersion} >= 0`)]);

export const childAppliedVersions = pgTable("child_applied_versions", {
  childId: uuid("child_id").primaryKey().references(() => users.id),
  version: integer("version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [check("child_applied_versions_nonnegative", sql`${table.version} >= 0`)]);

export const childUsualLimits = pgTable("child_usual_limits", {
  childId: uuid("child_id").primaryKey().references(() => users.id),
  minutes: integer("minutes").notNull(),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [check("child_usual_limits_minutes_range", sql`${table.minutes} >= 0 AND ${table.minutes} <= 1440`)]);
