// Test-only entry point. Does not load dotenv or connect to an external database.
import { appendFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
if (process.env.DATABASE_URL || process.env.LOCAL_DB_DIR) throw new Error('Isolated environment required');
delete process.env.VERCEL_ENV;
delete process.env.GOOGLE_WEB_CLIENT_ID;
process.env.MOCK = '1';
const { default: app } = await import('../../../../tmp/android-security-build/src/server/app.js');
const { db } = await import('../../../../tmp/android-security-build/src/server/db/index.js');
await db();
const evidence = new URL('./http-metadata.jsonl', import.meta.url);
const outage = new URL('./NETWORK_DOWN', import.meta.url);
createServer(async (incoming, outgoing) => {
  if (existsSync(outage)) { incoming.socket.destroy(); return; }
  try {
    const request = new Request('http://127.0.0.1:4313' + incoming.url, {
      method: incoming.method, headers: incoming.headers as HeadersInit,
      body: ['GET', 'HEAD'].includes(incoming.method ?? '') ? undefined : incoming,
      duplex: 'half',
    } as RequestInit);
    const response = await app.fetch(request);
    appendFileSync(evidence, JSON.stringify({ time: new Date().toISOString(), method: request.method, path: new URL(request.url).pathname, status: response.status }) + '\n');
    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.statusCode = 500; outgoing.end(); }
}).listen(4313, '127.0.0.1');
console.log('Security test API ready: loopback port 4313, isolated in-memory PGlite, MOCK=1');

