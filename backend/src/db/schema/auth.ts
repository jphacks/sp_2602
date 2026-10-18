import { index, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/** External identity mapping; token verification and accepted providers are service policy. */
export const authIdentities = pgTable("auth_identities", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  provider: varchar("provider", { length: 40 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [unique("auth_identities_provider_subject_unique").on(table.provider, table.subject)]);

/**
 * Only a one-way token digest is persisted. Expiry is nullable until policy is approved.
 * revoked_reason: 合言葉を無効にした理由（revoked_at と同時に書く。D-133）。
 *   "sign_out"        … その端末でログアウトした（authSignOut）
 *   "sign_out_others" … 同じ人が別の端末から「ほかの端末からもログアウト」をした
 *   "family_unlink"   … 保護者が子どもとの連携を外した（familyUnlink。子どもの合言葉すべて）
 *   NULL              … まだ無効にしていない、または 0018 より前に無効にした行
 * family_unlink の合言葉で呼ばれたときだけ、401 の本文に reason を付けて「連携が外れた」と知らせる（src/server/auth.ts の authorize）。
 */
export const userSessions = pgTable("user_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  tokenHash: varchar("token_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedReason: varchar("revoked_reason", { length: 40 }),
}, (table) => [unique("user_sessions_token_hash_unique").on(table.tokenHash)]);

/**
 * QR の番号の送り間違い（pairClaim の not_found・conflict）の記録。同じ人が 10 分に 10 回まちがえたら、しばらく断る（総当たりを防ぐ）。
 * Vercel では呼ぶたびに別のインスタンスになりうるので、数はメモリではなく DB で数える。成功したらその人の記録を消す。
 */
export const pairClaimFailures = pgTable("pair_claim_failures", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  failedAt: timestamp("failed_at", { withTimezone: true }).notNull(),
}, (table) => [index("pair_claim_failures_user_failed_idx").on(table.userId, table.failedAt)]);
