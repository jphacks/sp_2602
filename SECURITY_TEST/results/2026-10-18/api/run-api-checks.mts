import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import app from '../../../../src/server/app.ts';
import { db } from '../../../../src/server/db/index.ts';
import { digest } from '../../../../src/server/auth/digest.ts';
import { users, authIdentities, userSessions, familyLinks } from '../../../../backend/src/db/schema/index.ts';

process.env.MOCK = '1';
process.env.DATABASE_URL = '';
process.env.LOCAL_DB_DIR = '';
process.env.VERCEL_ENV = '';
const database = await db();
const people = [
  ['parentA','10000000-0000-4000-8000-000000000001','parent'],
  ['childA','10000000-0000-4000-8000-000000000002','child'],
  ['parentB','20000000-0000-4000-8000-000000000001','parent'],
  ['childB','20000000-0000-4000-8000-000000000002','child'],
] as const;
const tokens = {} as Record<string,string>;
for (const [name,id,role] of people) {
  const token = randomBytes(32).toString('base64url'); tokens[name] = token;
  await database.insert(users).values({id,role,displayName:name});
  await database.insert(authIdentities).values({userId:id,provider:'security-test',subject:name});
  await database.insert(userSessions).values({userId:id,tokenHash:digest(token)});
}
await database.insert(familyLinks).values([
 {parentId:people[0][1], childId:people[1][1]},
 {parentId:people[2][1], childId:people[3][1]},
]);
const extra = new Map<string, { id: string; token: string }>();
for (const [name,id] of [
  ['qrChild','30000000-0000-4000-8000-000000000001'],
  ['qrParent','30000000-0000-4000-8000-000000000002'],
  ['qrWrongChild','30000000-0000-4000-8000-000000000003'],
  ['pairProbe','30000000-0000-4000-8000-000000000004'],
  ['expiredChild','40000000-0000-4000-8000-000000000001'],
  ['expiredParent','40000000-0000-4000-8000-000000000002'],
  ['inputSQL','50000000-0000-4000-8000-000000000001'],
  ['inputXSS','50000000-0000-4000-8000-000000000002'],
] as const) {
  const token = randomBytes(32).toString('base64url');
  extra.set(name,{id,token});
  await database.insert(users).values({id,displayName:name});
  await database.insert(userSessions).values({userId:id,tokenHash:digest(token)});
}
const server = createServer((req,res) => app.fetch(new Request(`http://127.0.0.1:4311${req.url}`, {method:req.method,headers:req.headers as HeadersInit,body:['GET','HEAD'].includes(req.method||'')?undefined:req,duplex:'half'} as RequestInit)).then(async x=>{res.statusCode=x.status;x.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await x.arrayBuffer()));}).catch(()=>{res.statusCode=500;res.end();}));
await new Promise<void>(r=>server.listen(4311,'127.0.0.1',r));
const cases:any[]=[];
let lastRequestStart = 0;
async function hit(id:string,path:string,method='GET', token?:string, payload?:unknown) {
 const pause = Math.max(0, 1000 - (Date.now() - lastRequestStart));
 if (pause) await new Promise(resolve => setTimeout(resolve, pause));
 lastRequestStart = Date.now();
 const headers:Record<string,string>={}; if(token) headers.authorization=`Bearer ${token}`; if(payload!==undefined) headers['content-type']='application/json';
 const response=await fetch(`http://127.0.0.1:4311${path}`,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});
 const raw=await response.text(); let body:any; try{body=JSON.parse(raw)}catch{body={rawType:raw.slice(0,30)}};
 cases.push({id,status:response.status,body});
 return {response,body};
}
const childId='10000000-0000-4000-8000-000000000002'; const childB='20000000-0000-4000-8000-000000000002';
await hit('API-01','/api/auth/me');
await hit('API-02','/api/auth/me','GET','malformed-token-value');
await hit('API-03','/api/plan/usual-limit','POST',tokens.childA,{childId,expectedVersion:0,usualLimitMinutes:88});
await hit('API-04','/api/config/get','POST',tokens.parentA,{childId:childB,knownVersion:0});
await hit('API-05','/api/config/get','POST',tokens.parentA,{childId:childB,knownVersion:0});
await hit('API-06','/api/usage/upload','POST',tokens.childA,{submissionId:'30000000-0000-4000-8000-000000000001',childId:childB,days:[{date:'2026-10-18',measuredAt:'2026-10-18T01:00:00Z',restrictedMinutes:1,apps:[]}]});
await hit('IN-04','/api/plan/save','POST',tokens.parentA,{childId,expectedVersion:0,planStartDate:'2026-02-31',startLimitMinutes:300,finalGoalMinutes:100});
await hit('IN-05','/api/plan/save','POST',tokens.parentA,{childId,expectedVersion:0,planStartDate:'2026-10-20',startLimitMinutes:-1,finalGoalMinutes:0});
await hit('API-07','/api/plan/usual-limit','POST',tokens.parentA,{childId,expectedVersion:0,usualLimitMinutes:88,role:'parent',createdByUserId:people[0][1],parentId:people[0][1]});
await hit('API-08a','/api/health'); await hit('API-08b','/not-a-route'); await hit('API-08c','/api/auth/me');
await hit('API-12a','/api/config/get','POST',tokens.parentA,{childId:'not-a-uuid',knownVersion:0});
await hit('API-12b','/api/config/get','POST',tokens.parentA,{childId:childB,knownVersion:0});
await hit('IN-07','/api/plan/usual-limit','POST',tokens.parentA,{childId,expectedVersion:1,usualLimitMinutes:88,role:'child',createdByUserId:people[3][1],parentId:people[3][1],isAdmin:true,ownerId:people[3][1]});
if (process.env.RUN_SECURITY_OVERSIZE_PROBE === '1') {
 await hit('IN-11','/api/health','POST',undefined,'x'.repeat(8*1024*1024+1));
} else cases.push({id:'IN-11',status:'skipped-by-default',body:{reason:'oversize probe requires RUN_SECURITY_OVERSIZE_PROBE=1'}});
await hit('AVL-01','/api/auth/me','GET',tokens.parentA);
const inputSQL=extra.get('inputSQL')!, inputXSS=extra.get('inputXSS')!;
const sqlTicket=await hit('IN-01','/api/pair/start','POST',inputSQL.token,{name:"' OR '1'='1"});
await hit('IN-01-observation','/api/pair/status','POST',inputSQL.token,{pairId:sqlTicket.body.pairId});
const xssTicket=await hit('IN-02','/api/pair/start','POST',inputXSS.token,{name:'<script>alert(1)</script>'});
await hit('IN-02-observation','/api/pair/status','POST',inputXSS.token,{pairId:xssTicket.body.pairId});
await hit('IN-03a','/api/pair/start','POST',inputSQL.token,{name:'a'.repeat(40)});
await hit('IN-03b','/api/pair/start','POST',inputSQL.token,{name:'a'.repeat(41)});
const usagePayload={submissionId:'60000000-0000-4000-8000-000000000001',childId,days:[{date:'2026-10-18',measuredAt:new Date().toISOString(),restrictedMinutes:1,apps:[]}]};
await hit('IN-08a','/api/usage/upload','POST',tokens.childA,usagePayload);
await hit('IN-08b','/api/usage/upload','POST',tokens.childA,usagePayload);
await hit('IN-08c','/api/usage/upload','POST',tokens.childA,{...usagePayload,days:[{...usagePayload.days[0],restrictedMinutes:2}]});
const qrChild=extra.get('qrChild')!, qrParent=extra.get('qrParent')!, qrWrong=extra.get('qrWrongChild')!;
const ticket=await hit('API-09a','/api/pair/start','POST',qrChild.token,{name:'QR child A'});
const code=ticket.body.code, pairId=ticket.body.pairId;
await hit('API-10','/api/pair/confirm','POST',qrWrong.token,{pairId,accept:true});
await hit('API-09b','/api/pair/claim','POST',qrParent.token,{code});
await hit('API-09c','/api/pair/claim','POST',qrParent.token,{code});
await hit('API-09d','/api/pair/confirm','POST',qrChild.token,{pairId,accept:true});
await hit('API-11','/api/pair/confirm','POST',qrChild.token,{pairId,accept:true});
const expiredChild=extra.get('expiredChild')!, expiredParent=extra.get('expiredParent')!;
const expired=await hit('PII-09a','/api/pair/start','POST',expiredChild.token,{name:'QR child B'});
await database.update((await import('../../../../backend/src/db/schema/index.ts')).pairTickets).set({expiresAt:new Date(Date.now()-60_000)}).where((await import('drizzle-orm')).eq((await import('../../../../backend/src/db/schema/index.ts')).pairTickets.id,expired.body.pairId));
await hit('PII-09b','/api/pair/claim','POST',expiredParent.token,{code:expired.body.code});
const { count, eq } = await import('drizzle-orm');
const [{ n: linkedCount }] = await database.select({n:count()}).from(familyLinks).where(eq(familyLinks.childId,qrChild.id));
cases.push({id:'API-11-side-effect',status:'observed',body:{familyLinksForQrChild:linkedCount}});
if (process.env.RUN_SECURITY_QR_RATE_PROBE === '1') {
  const probe=extra.get('pairProbe')!;
  for(let i=1;i<=11;i++) await hit(`AVL-01-${i}`,'/api/pair/claim','POST',probe.token,{code:'not-a-real-pair-code'});
} else cases.push({id:'AVL-01-rate-loop',status:'skipped-by-default',body:{reason:'QR rate probe requires RUN_SECURITY_QR_RATE_PROBE=1'}});
await new Promise<void>(r=>server.close(()=>r()));
for (const c of cases) if (c.body && typeof c.body === 'object') {
  if ('token' in c.body) c.body.token = '[redacted synthetic token]';
  if (typeof c.body.code === 'string' && /^[0-9a-f]{40}$/i.test(c.body.code)) c.body.code = '[redacted synthetic QR code]';
  if ('pairId' in c.body) c.body.pairId = '[synthetic pair id]';
  if (c.body.child && typeof c.body.child === 'object' && 'id' in c.body.child) c.body.child.id = '[synthetic child id]';
}
await writeFile(new URL('./evidence.json', import.meta.url), `${JSON.stringify({observedAt:new Date().toISOString(),server:'127.0.0.1:4311',database:'ephemeral PGlite',cases},null,2)}\n`, 'utf8');
console.log(`Sanitized evidence written: SECURITY_TEST/results/2026-10-18/api/evidence.json (${cases.length} observations)`);









