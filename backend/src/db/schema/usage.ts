import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

/** One immutable client-generated idempotency key per accepted upload. */
export const usageSyncBatches = pgTable("usage_sync_batches", {
  submissionId: uuid("submission_id").notNull(),
  childId: uuid("child_id").notNull().references(() => users.id),
  payloadHash: text("payload_hash"),
  appliedDates: date("applied_dates", { mode: "string" }).array().default(sql`'{}'::date[]`).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: "usage_sync_batches_pk", columns: [table.submissionId] }),
  unique("usage_sync_batches_submission_child_unique").on(table.submissionId, table.childId),
  index("usage_sync_batches_child_received_idx").on(table.childId, table.receivedAt),
]);

/** Per-date C8 snapshot, preserving the device measurement time and restricted total. Only the newest per child and date is kept (usage-persistence.ts). */
export const usageDayReports = pgTable("usage_day_reports", {
  submissionId: uuid("submission_id").notNull(),
  childId: uuid("child_id").notNull(),
  usageDate: date("usage_date", { mode: "string" }).notNull(),
  measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
  restrictedMinutes: integer("restricted_minutes").notNull(),
}, (table) => [
  primaryKey({ name: "usage_day_reports_submission_date_pk", columns: [table.submissionId, table.usageDate] }),
  foreignKey({
    name: "usage_day_reports_submission_child_fk",
    columns: [table.submissionId, table.childId],
    foreignColumns: [usageSyncBatches.submissionId, usageSyncBatches.childId],
  }),
  index("usage_day_reports_child_date_measured_idx").on(table.childId, table.usageDate, table.measuredAt),
  check("usage_day_reports_restricted_minutes_nonnegative", sql`${table.restrictedMinutes} >= 0`),
]);

/** App-level snapshot rows of the kept day report; each record is scoped to an app and date (replaced with the day report). */
export const usageRecords = pgTable("usage_records", {
  recordId: uuid("record_id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id").notNull(),
  childId: uuid("child_id").notNull(),
  usageDate: date("usage_date", { mode: "string" }).notNull(),
  appId: varchar("app_id", { length: 255 }).notNull(),
  label: varchar("label", { length: 120 }),
  usedMinutes: integer("used_minutes").notNull(),
  excluded: boolean("excluded"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    name: "usage_records_submission_child_fk",
    columns: [table.submissionId, table.childId],
    foreignColumns: [usageSyncBatches.submissionId, usageSyncBatches.childId],
  }),
  foreignKey({
    name: "usage_records_day_report_fk",
    columns: [table.submissionId, table.usageDate],
    foreignColumns: [usageDayReports.submissionId, usageDayReports.usageDate],
  }),
  unique("usage_records_submission_date_app_unique").on(table.submissionId, table.usageDate, table.appId),
  index("usage_records_child_date_app_idx").on(table.childId, table.usageDate, table.appId),
  check("usage_records_minutes_nonnegative", sql`${table.usedMinutes} >= 0`),
  check("usage_records_app_id_not_blank", sql`length(trim(${table.appId})) > 0`),
]);
