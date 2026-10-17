import { check, index, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

/** Pairing ticket state storage. Raw QR codes are never persisted. */
export const pairTickets = pgTable("pair_tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  codeHash: varchar("code_hash", { length: 255 }).notNull(),
  childId: uuid("child_id").notNull().references(() => users.id),
  childDisplayName: varchar("child_display_name", { length: 120 }).notNull(),
  parentId: uuid("parent_id").references(() => users.id),
  state: varchar("state", { length: 16 }).default("waiting").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  unique("pair_tickets_code_hash_unique").on(table.codeHash),
  index("pair_tickets_child_created_idx").on(table.childId, table.createdAt),
  index("pair_tickets_parent_created_idx").on(table.parentId, table.createdAt),
  check("pair_tickets_state_check", sql`${table.state} in ('waiting', 'claimed', 'linked', 'expired', 'rejected')`),
]);
