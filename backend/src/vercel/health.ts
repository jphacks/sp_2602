import "dotenv/config";
import { connectDatabase } from "../db/index.js";
import { isDatabaseHealthy } from "../db/health.js";

// Keep one small pool per warm Function instance.
const { db } = connectDatabase({ maxConnections: 1 });

export async function GET(): Promise<Response> {
  if (await isDatabaseHealthy(db)) {
    return Response.json({ status: "ok", database: "ok" });
  }

  return Response.json({ status: "unavailable" }, { status: 503 });
}
