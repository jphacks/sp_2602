import "dotenv/config";
import { createServer } from "node:http";
import { connectDatabase } from "./db/index.js";
import { isDatabaseHealthy } from "./db/health.js";

const port = Number(process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const { db, client } = connectDatabase();
const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    if (await isDatabaseHealthy(db)) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok", database: "ok" }));
    } else {
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "unavailable" }));
    }
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Backend listening on port ${port}.`);
});

async function shutdown(): Promise<void> {
  server.close();
  await client.end();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
