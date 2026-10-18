import { writeFileSync } from 'node:fs';
import { api } from '../../../../contracts/api.js';
// One request per distinct protected endpoint; no token or personal data used.
const observations = [];
for (const [name, route] of Object.entries(api)) {
  if (route.auth === 'none') continue;
  const started = Date.now();
  const response = await fetch('http://127.0.0.1:4313' + route.path, {
    method: route.method,
    headers: { 'Content-Type': 'application/json' },
    body: route.method === 'GET' ? undefined : '{}',
  });
  const raw = await response.text();
  let code = null;
  try { code = JSON.parse(raw).code ?? null; } catch {}
  observations.push({ name, method: route.method, path: route.path, status: response.status, responseBytes: Buffer.byteLength(raw), code, genericUnauthorized: response.status === 401 && code === 'unauthorized', requestStartedAt: new Date(started).toISOString() });
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 1050 - (Date.now() - started))));
}
writeFileSync(new URL('./unauthenticated-matrix.json', import.meta.url), JSON.stringify(observations, null, 2) + '\n');
console.log(JSON.stringify({ endpoints: observations.length, unauthorized: observations.filter(x => x.genericUnauthorized).length, allRejected: observations.every(x => x.genericUnauthorized) }));
