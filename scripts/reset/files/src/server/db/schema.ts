// DB のテーブル定義（共有の場所。サーバ担当の back-a が足す）。契約（contracts/）とは別物。画面に渡す形への変換は src/server/ の中で行う。
// 約束（docs/rules/stack.md「DB」）:
//   - id は uuid（defaultRandom）、作成日時は created_at（timestamptz）、列名は snake_case（端末の id のように自然な主キーがあるときは、それを主キーにしてよい）
//   - 形が決まらないもの（外から届いた生のデータなど）は jsonb に丸ごと入れる。外部キーの連鎖削除は使わない
//   - 変えたら npm run db:push（マイグレーションは作らない）
// npm run kit:reset 後の空の状態。テーブルは課題が決まってから足す:
//   import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
//   export const foo = pgTable("foo", { id: uuid("id").primaryKey().defaultRandom(), name: text("name").notNull(),
//     createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow() });
export {};
