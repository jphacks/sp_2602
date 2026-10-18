import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  boolean,
  pgTable,
  primaryKey,
  timestamp,
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
  configVersion: integer("config_version").notNull(),
  planStartDate: date("plan_start_date", { mode: "string" }).notNull(),
  startLimitMinutes: integer("start_limit_minutes").notNull(),
  finalGoalMinutes: integer("final_goal_minutes").notNull(),
  usualLimitMinutes: integer("usual_limit_minutes").notNull(),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("plan_settings_config_version_positive", sql`${table.configVersion} > 0`),
  check("plan_settings_start_limit_range", sql`${table.startLimitMinutes} >= 0 AND ${table.startLimitMinutes} <= 1440`),
  check("plan_settings_final_goal_range", sql`${table.finalGoalMinutes} >= 0 AND ${table.finalGoalMinutes} <= 1440`),
  check("plan_settings_usual_limit_range", sql`${table.usualLimitMinutes} >= 0 AND ${table.usualLimitMinutes} <= 1440`),
]);

export const planCalculationVersions = pgTable("plan_calculation_versions", {
  childId: uuid("child_id").notNull().references(() => users.id),
  version: integer("version").notNull(),
  sourceC10InputVersion: integer("source_c10_input_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: "plan_calculation_versions_pk", columns: [table.childId, table.version] }),
  check("plan_calculation_versions_positive", sql`${table.version} > 0`),
  check("plan_calculation_source_c10_input_version_positive", sql`${table.sourceC10InputVersion} > 0`),
]);

export const dailyLimits = pgTable("daily_limits", {
  childId: uuid("child_id").notNull().references(() => users.id),
  limitDate: date("limit_date", { mode: "string" }).notNull(),
  limitKind: varchar("limit_kind", { length: 16 }).default("limited").notNull(),
  limitMinutes: integer("limit_minutes"),
  isFinalized: boolean("is_finalized").default(false).notNull(),
  // Snapshot identity only: do not FK historical D6 rows to a mutable/deletable D3 blank period.
  blankPeriodId: uuid("blank_period_id"),
  calculationVersion: integer("calculation_version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Retain one row per calculation revision so historical D6 snapshots are not
  // overwritten when the same child/date is recalculated.
  primaryKey({ name: "daily_limits_pk", columns: [table.childId, table.limitDate, table.calculationVersion] }),
  check("daily_limits_kind_value", sql`${table.limitKind} IN ('limited', 'unlimited')`),
  check("daily_limits_minutes_range", sql`${table.isFinalized} OR (${table.limitMinutes} >= 0 AND ${table.limitMinutes} <= 1440)`),
  check("daily_limits_limit_shape", sql`(
    ${table.limitKind} = 'limited' AND ${table.limitMinutes} IS NOT NULL AND ${table.blankPeriodId} IS NULL
  ) OR (
    ${table.limitKind} = 'unlimited' AND ${table.limitMinutes} IS NULL AND ${table.blankPeriodId} IS NOT NULL
  )`),
  check("daily_limits_version_positive", sql`${table.calculationVersion} > 0`),
  foreignKey({
    name: "daily_limits_calculation_version_fk",
    columns: [table.childId, table.calculationVersion],
    foreignColumns: [planCalculationVersions.childId, planCalculationVersions.version],
  }),
]);
