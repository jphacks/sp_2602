// DB のテーブル定義（共有の場所。サーバ担当の back-a が足す）。契約（contracts/）とは別物。画面に渡す形への変換は src/server/ の中で行う。
// 約束:
//   - id は uuid（defaultRandom）、作成日時は created_at（timestamptz）、列名は snake_case（端末の id のように自然な主キーがあるときは、それを主キーにしてよい）
//   - 形が決まらないもの（外から届いた生のデータなど）は jsonb に丸ごと入れる。外部キーの連鎖削除は使わない
//   - 変えたら npm run db:push（マイグレーションは作らない）
import { jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// 子どもごとの制限ルール（例。契約の Rules を保存する形）。保護者が保存し、子どもの端末が同期で読む
export const rules = pgTable("rules", {
  childId: text("child_id").primaryKey(), // 子どもの端末ごとの id（ログインを作らない間の区別）
  limits: jsonb("limits").notNull(), // AppLimit の配列（形が決まらないものは jsonb に丸ごと）
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 子どもの1日ぶんの使用状況（契約の Usage を保存する形）。子どもの端末が送り、保護者が見る。(child_id, date) が自然な主キー
export const usage = pgTable(
  "usage",
  {
    childId: text("child_id").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD（端末のある日）
    apps: jsonb("apps").notNull(), // AppUsage の配列
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.childId, t.date] })],
);
