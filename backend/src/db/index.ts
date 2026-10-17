import postgres, { type Sql } from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index.js";

export type Database = PostgresJsDatabase<typeof schema>;

export function createDatabase(connectionString: string): { db: Database; client: Sql } {
  const parsed = new URL(connectionString);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol.");
  }

  const client = postgres(connectionString, {
    max: 10,
    connect_timeout: 10,
    idle_timeout: 20,
    prepare: false,
  });

  return { db: drizzle(client, { schema }), client };
}

export function connectDatabase(): { db: Database; client: Sql } {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }
  return createDatabase(connectionString);
}
