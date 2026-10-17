// Hono routes and the backend repositories share one PostgreSQL schema.
// Neon HTTP cannot run the multi-step interactive transactions needed by C8/C10,
// so Vercel's Node.js runtime uses Neon's WebSocket driver with a pooled URL.
// Local development without DATABASE_URL uses ephemeral PGlite.
import type { Database } from "../../../backend/src/db/index.js";
import * as schema from "../../../backend/src/db/schema/index.js";

export { isDatabaseHealthy } from "../../../backend/src/db/health.js";
export type Db = Database;

type RuntimeDb = { db: Db; close?: () => Promise<void> };
const g = globalThis as unknown as { __slopeRuntimeDb?: Promise<RuntimeDb> };

export async function db(): Promise<Db> {
  g.__slopeRuntimeDb ??= open().catch((error) => {
    g.__slopeRuntimeDb = undefined;
    throw error;
  });
  return (await g.__slopeRuntimeDb).db;
}

async function open(): Promise<RuntimeDb> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const [{ Pool }, { drizzle }] = await Promise.all([
      import("@neondatabase/serverless"),
      import("drizzle-orm/neon-serverless"),
    ]);
    const pool = new Pool({ connectionString: url, max: 1 });
    return {
      db: drizzle({ client: pool, schema }) as unknown as Db,
      close: () => pool.end(),
    };
  }
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("DATABASE_URL is required in Vercel production.");
  }

  const [{ PGlite }, { drizzle }] = await Promise.all([import("@electric-sql/pglite"), import("drizzle-orm/pglite")]);
  const local = drizzle({ client: new PGlite(), schema });
  const { pushSchema } = await import("drizzle-kit/api");
  const { apply } = await pushSchema(schema, local as never);
  await apply();
  return { db: local as unknown as Db };
}
