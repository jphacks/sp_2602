// DB のテーブル定義（共有の場所。サーバ担当の back-a が足す）。契約（contracts/）とは別物。画面に渡す形への変換は src/server/ の中で行う。
// 約束（docs/rules/stack.md「DB」）:
//   - id は uuid（defaultRandom）、作成日時は created_at（timestamptz）、列名は snake_case
//   - 形が決まらないもの（AI の生の返答など）は jsonb に丸ごと入れる。外部キーの連鎖削除は使わない
//   - 変えたら npm run db:push（マイグレーションは作らない）
import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// AI の呼び出し記録。どのアイデアでも使う（審査で「本物が動いている」を示す材料・不具合の調査・デモの再現）
export const aiCalls = pgTable("ai_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  route: text("route").notNull(), // 契約の API 名（contracts/api.ts）
  clientId: text("client_id"), // ログインなしの利用者の区別（端末ごとの id）
  model: text("model"),
  input: jsonb("input"),
  output: jsonb("output"),
  ms: integer("ms"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
