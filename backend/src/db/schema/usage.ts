import { sql } from "drizzle-orm";
import {
  check,
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

/** One client-generated idempotency key per accepted upload. */
export const usageSyncBatches = pgTable("usage_sync_batches", {
  submissionId: uuid("submission_id").notNull(),
  childId: uuid("child_id").notNull().references(() => users.id),
  payloadHash: text("payload_hash"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: "usage_sync_batches_pk", columns: [table.submissionId] }),
  unique("usage_sync_batches_submission_child_unique").on(table.submissionId, table.childId),
  index("usage_sync_batches_child_received_idx").on(table.childId, table.receivedAt),
]);

/** Rows are immutable accepted snapshots; later aggregation semantics belong to C8/C6. */
export const usageRecords = pgTable("usage_records", {
  submissionId: uuid("submission_id").notNull(),
  childId: uuid("child_id").notNull(),
  usageDate: date("usage_date", { mode: "string" }).notNull(),
  appId: varchar("app_id", { length: 255 }).notNull(),
  usedMinutes: integer("used_minutes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({
    name: "usage_records_submission_date_app_pk",
    columns: [table.submissionId, table.usageDate, table.appId],
  }),
  foreignKey({
    name: "usage_records_submission_child_fk",
    columns: [table.submissionId, table.childId],
    foreignColumns: [usageSyncBatches.submissionId, usageSyncBatches.childId],
  }),
  index("usage_records_child_date_app_idx").on(table.childId, table.usageDate, table.appId),
  check("usage_records_minutes_nonnegative", sql`${table.usedMinutes} >= 0`),
  check("usage_records_app_id_not_blank", sql`length(trim(${table.appId})) > 0`),
]);
