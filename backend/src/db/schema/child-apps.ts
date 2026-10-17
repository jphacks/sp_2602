import { sql } from "drizzle-orm";
import { check, pgTable, primaryKey, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * Q15（docs/decisions.md D-110）: 子どもの端末から最後に届いたアプリ一覧の「届いた」印。子ども1人に1行。
 * 行がない = まだ一度も届いていない（親16 は「まだ届いていません」を出す）。行があって下の表に0行 = 届いた一覧が空。
 * 中身は全件の置き換え（backend/src/db/child-apps.ts の replaceChildApps）。使用時間とは別（C8 の usage_* の表）。
 */
export const childAppLists = pgTable("child_app_lists", {
  childId: uuid("child_id").primaryKey().references(() => users.id),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
});

/** 子どもの端末のホーム画面に出るアプリ1つ（packageName と表示名だけ。親16 で対象外を選ぶ候補）。 */
export const childAppListItems = pgTable("child_app_list_items", {
  childId: uuid("child_id").notNull().references(() => childAppLists.childId, { onDelete: "cascade" }),
  appId: varchar("app_id", { length: 255 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
}, (table) => [
  primaryKey({ name: "child_app_list_items_pk", columns: [table.childId, table.appId] }),
  check("child_app_list_items_app_id_not_blank", sql`length(trim(${table.appId})) > 0`),
  check("child_app_list_items_label_not_blank", sql`length(trim(${table.label})) > 0`),
]);

/**
 * 子どもの端末のアプリのアイコン（PNG・base64。1枚 20KB 以下）。アプリ1つに1行。
 * icon_hash は PNG の中身の SHA-256（サーバが中身から計算し直して確かめた値）。端末はこれと違うときだけ送り直し、
 * 保護者の端末はこれが変わったときだけ読み直す。一覧から消えたアプリの行は、一覧の置き換えのときに消す。
 */
export const childAppIcons = pgTable("child_app_icons", {
  childId: uuid("child_id").notNull().references(() => childAppLists.childId, { onDelete: "cascade" }),
  appId: varchar("app_id", { length: 255 }).notNull(),
  iconHash: varchar("icon_hash", { length: 64 }).notNull(),
  png: text("png").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ name: "child_app_icons_pk", columns: [table.childId, table.appId] }),
]);
