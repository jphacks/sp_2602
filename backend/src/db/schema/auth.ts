import { pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/** External identity mapping; token verification and accepted providers are service policy. */
export const authIdentities = pgTable("auth_identities", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  provider: varchar("provider", { length: 40 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [unique("auth_identities_provider_subject_unique").on(table.provider, table.subject)]);

/** Only a one-way token digest is persisted. Expiry is nullable until policy is approved. */
export const userSessions = pgTable("user_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  tokenHash: varchar("token_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [unique("user_sessions_token_hash_unique").on(table.tokenHash)]);
