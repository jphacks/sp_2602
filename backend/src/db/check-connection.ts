import "dotenv/config";
import { sql } from "drizzle-orm";
import { connectDatabase } from "./index.js";

const { db, client } = connectDatabase();
try {
  const result = await db.execute(sql`select 1 as connected`);
  if (Number(result[0]?.connected) !== 1) {
    throw new Error("The database did not return the expected connection result.");
  }
  console.log("Database connection succeeded.");
} finally {
  await client.end();
}
