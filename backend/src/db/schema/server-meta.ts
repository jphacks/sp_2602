import { check, pgTable, smallint, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * DB 全体で1行だけの表（id は必ず 1）。epoch は「この DB」を見分ける値で、C7 の設定の応答（ConfigResult）に入れる（docs/decisions.md D-109）。
 * DB を作り直す・PGlite と Neon を切り替えると別の値になり、サーバを再起動しても変わらない。
 * 行は最初に読んだときに作る（backend/src/db/server-epoch.ts）。手で書き換えない（書き換えると全部の端末が設定を取り直す）。
 */
export const serverMeta = pgTable("server_meta", {
  id: smallint("id").default(1).primaryKey(),
  epoch: uuid("epoch").defaultRandom().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [check("server_meta_single_row", sql`${table.id} = 1`)]);
