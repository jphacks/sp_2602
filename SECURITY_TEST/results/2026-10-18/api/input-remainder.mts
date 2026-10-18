import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { appendFile, writeFile } from 'node:fs/promises';
import app from '../../../../src/server/app.ts';
import { db } from '../../../../src/server/db/index.ts';
import { digest } from '../../../../src/server/auth/digest.ts';
import { users, userSessions, familyLinks } from '../../../../backend/src/db/schema/index.ts';

process.env.MOCK = '1'; process.env.DATABASE_URL = ''; process.env.LOCAL_DB_DIR = ''; process.env.VERCEL_ENV = '';
const d = await db();
const actors = [
  ['parentA', '91000000-0000-4000-8000-000000000001', 'parent'],
  ['childA', '91000000-0000-4000-8000-000000000002', 'child'],
  ['parentB', '92000000-0000-4000-8000-000000000001', 'parent'],
  ['childB', '92000000-0000-4000-8000-000000000002', 'child'],
] as const;
const tokens: Record<string, string> = {};
for (const [name, id, role] of actors) {
  const token = randomBytes(32).toString('base64url'); tokens[name] = token;
  await d.insert(users).values({ id, role, displayName: name });
  await d.insert(userSessions).values({ userId: id, tokenHash: digest(token) });
}
await d.insert(familyLinks).values([
  { parentId: actors[0][1], childId: actors[1][1] },
  { parentId: actors[2][1], childId: actors[3][1] },
]);
const server = createServer((req, res) => app.fetch(new Request(`http://127.0.0.1:4312${req.url}`, {
  method: req.method, headers: req.headers as HeadersInit,
  body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : req, duplex: 'half',
} as RequestInit)).then(async response => {
  res.statusCode = response.status; response.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await response.arrayBuffer()));
}));
await new Promise<void>(resolve => server.listen(4312, '127.0.0.1', resolve));

const cases: any[] = []; let lastStart = 0;
async function hit(id: string, path: string, token: string, payload: any) {
  const wait = Math.max(0, 1000 - (Date.now() - lastStart)); if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  lastStart = Date.now();
  const start = performance.now();
  const response = await fetch(`http://127.0.0.1:4312${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
  });
  const raw = await response.text(); let body: any; try { body = JSON.parse(raw); } catch { body = {}; }
  const item = { id, status: response.status, responseBytes: new TextEncoder().encode(raw).length,
    durationMs: Number((performance.now() - start).toFixed(2)), body };
  cases.push(item); await appendFile(new URL('./input-remainder-progress.jsonl', import.meta.url), `${JSON.stringify(item)}\n`, 'utf8');
  console.log(`${id} ${response.status}`); return body;
}

const childA = actors[1][1], childB = actors[3][1];
const parentA = tokens.parentA, parentB = tokens.parentB, tokenA = tokens.childA, tokenB = tokens.childB;
// IN-05: 0 is expressly supported; malformed value types/ranges must be rejected.
const zero = await hit('IN-05-zero', '/api/plan/usual-limit', parentA, { childId: childA, expectedVersion: 0, usualLimitMinutes: 0 });
const version = zero.configVersion ?? 0;
for (const [label, value] of [['decimal', 1.5], ['huge-integer', 9999999999], ['string', '5'], ['null', null], ['array', [5]]] as const) {
  await hit(`IN-05-${label}`, '/api/plan/save', parentA, { childId: childA, expectedVersion: version, planStartDate: '2026-10-18', startLimitMinutes: value, finalGoalMinutes: 0 });
}
await hit('IN-05-usage-negative', '/api/usage/upload', tokenA, { submissionId: '93000000-0000-4000-8000-000000000001', childId: childA, days: [{ date: '2026-10-18', measuredAt: new Date().toISOString(), restrictedMinutes: -1, apps: [] }] });
// IN-06: the API field is packageName, not the plan's appId wording.
for (const [label, packageName] of [['whitespace', '   '], ['max-plus-one', 'p'.repeat(256)], ['control', 'com.example.\u0001app']] as const) {
  await hit(`IN-06-${label}`, '/api/child-apps/upload', tokenA, { childId: childA, apps: [{ packageName, label: 'synthetic app' }] });
}
// PII-08: matching name/time/app patterns in two isolated families.
const pattern = { date: '2026-10-18', measuredAt: new Date().toISOString(), restrictedMinutes: 5,
  apps: [{ packageName: 'com.example.shared', label: 'Shared pattern', usedMinutes: 5, excluded: false }] };
await hit('PII-08-same-pattern-upload-A', '/api/usage/upload', tokenA, { submissionId: '94000000-0000-4000-8000-000000000001', childId: childA, days: [pattern] });
await hit('PII-08-same-pattern-upload-B', '/api/usage/upload', tokenB, { submissionId: '94000000-0000-4000-8000-000000000002', childId: childB, days: [pattern] });
const a = await hit('PII-08-same-pattern-read-A', '/api/usage/get', parentA, { childId: childA, from: '2026-10-18', to: '2026-10-18' });
const b = await hit('PII-08-same-pattern-read-B', '/api/usage/get', parentB, { childId: childB, from: '2026-10-18', to: '2026-10-18' });
cases.push({ id: 'PII-08-same-pattern-isolation', result: a.childId !== b.childId && a.days?.[0]?.apps?.[0]?.label === b.days?.[0]?.apps?.[0]?.label ? 'family-scoped' : 'unexpected',
  body: { distinctSyntheticChildIds: a.childId !== b.childId, parentARecordCount: a.days?.[0]?.apps?.length, parentBRecordCount: b.days?.[0]?.apps?.length } });
await new Promise<void>(resolve => server.close(() => resolve()));
await writeFile(new URL('./input-remainder-evidence.json', import.meta.url), `${JSON.stringify({ server: '127.0.0.1:4312', database: 'ephemeral PGlite', minRequestStartIntervalMs: 1000, cases }, null, 2)}\n`, 'utf8');
console.log(`Remainder evidence written: ${cases.length} observations.`);
