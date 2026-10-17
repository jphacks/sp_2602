import { sql } from "drizzle-orm";
import type { Database } from "./index.js";

export async function isDatabaseHealthy(db: Database): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
