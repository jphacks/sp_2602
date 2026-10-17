import { pgEnum, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["parent", "child"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  role: userRole("role").notNull(),
  displayName: varchar("display_name", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [unique("users_id_role_unique").on(table.id, table.role)]);
