import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * 呼び出し回数の上限（セキュリティ検査 F-5 / AVL-01）。上限を数える API を呼ぶたびに1行。
 *   bucket   : 何の上限か（"auth-ip"・"auth-subject"・"pair-start"。src/server/rate-limit.ts）
 *   key_hash : 誰の分か（IP・ログインの subject・利用者 id）の SHA-256。IP をそのまま残さない
 *   hit_at   : 呼ばれた時刻（サーバの時計）
 * Vercel では呼ぶたびに別のインスタンスになりうるので、数はメモリではなく DB で数える（pair_claim_failures と同じ考え）。
 * 窓（数える時間）を過ぎた行は、次に同じ bucket を数えるときに消す。
 */
export const rateLimitHits = pgTable("rate_limit_hits", {
  id: uuid("id").defaultRandom().primaryKey(),
  bucket: varchar("bucket", { length: 40 }).notNull(),
  keyHash: varchar("key_hash", { length: 64 }).notNull(),
  hitAt: timestamp("hit_at", { withTimezone: true }).notNull(),
}, (table) => [index("rate_limit_hits_bucket_key_hit_idx").on(table.bucket, table.keyHash, table.hitAt)]);
