import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const testPeriods = pgTable("test_periods", {
  id: uuid("id").defaultRandom().primaryKey(),
  childId: uuid("child_id").notNull().references(() => users.id),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 120 }).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("test_periods_name_not_blank", sql`length(trim(${table.name})) > 0`),
  check("test_periods_end_not_before_start", sql`${table.endDate} >= ${table.startDate}`),
  index("test_periods_child_start_idx").on(table.childId, table.startDate),
]);

export const planSettings = pgTable("plan_settings", {
  childId: uuid("child_id").primaryKey().references(() => users.id),
  planStartDate: date("plan_start_date", { mode: "string" }).notNull(),
  startLimitMinutes: integer("start_limit_minutes").notNull(),
  finalGoalMinutes: integer("final_goal_minutes").notNull(),
  usualLimitMinutes: integer("usual_limit_minutes").notNull(),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("plan_settings_start_limit_nonnegative", sql`${table.startLimitMinutes} >= 0`),
  check("plan_settings_final_goal_nonnegative", sql`${table.finalGoalMinutes} >= 0`),
  check("plan_settings_usual_limit_nonnegative", sql`${table.usualLimitMinutes} >= 0`),
]);

export const planCalculationVersions = pgTable("plan_calculation_versions", {
  childId: uuid("child_id").notNull().references(() => users.id),
  version: integer("version").notNull(),
  sourceConfigVersion: integer("source_config_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: "plan_calculation_versions_pk", columns: [table.childId, table.version] }),
  check("plan_calculation_versions_positive", sql`${table.version} > 0`),
  check("plan_calculation_source_version_positive", sql`${table.sourceConfigVersion} > 0`),
]);

export const dailyLimits = pgTable("daily_limits", {
  childId: uuid("child_id").notNull().references(() => users.id),
  limitDate: date("limit_date", { mode: "string" }).notNull(),
  limitMinutes: integer("limit_minutes").notNull(),
  calculationVersion: integer("calculation_version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: "daily_limits_pk", columns: [table.childId, table.limitDate] }),
  check("daily_limits_minutes_nonnegative", sql`${table.limitMinutes} >= 0`),
  check("daily_limits_version_positive", sql`${table.calculationVersion} > 0`),
  unique("daily_limits_child_date_version_unique").on(table.childId, table.limitDate, table.calculationVersion),
  foreignKey({
    name: "daily_limits_calculation_version_fk",
    columns: [table.childId, table.calculationVersion],
    foreignColumns: [planCalculationVersions.childId, planCalculationVersions.version],
  }),
]);
