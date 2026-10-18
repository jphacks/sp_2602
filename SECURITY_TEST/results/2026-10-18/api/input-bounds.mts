import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { appendFile, writeFile } from 'node:fs/promises';
import app from '../../../../src/server/app.ts';
import { db } from '../../../../src/server/db/index.ts';
import { digest } from '../../../../src/server/auth/digest.ts';
import { users,userSessions,familyLinks } from '../../../../backend/src/db/schema/index.ts';
process.env.MOCK='1';process.env.DATABASE_URL='';process.env.LOCAL_DB_DIR='';process.env.VERCEL_ENV='';
const d=await db();const actors=[['parentA','91000000-0000-4000-8000-000000000001','parent'],['childA','91000000-0000-4000-8000-000000000002','child'],['parentB','92000000-0000-4000-8000-000000000001','parent'],['childB','92000000-0000-4000-8000-000000000002','child']] as const;const tokens:Record<string,string>={};
for(const [name,id,role] of actors){const token=randomBytes(32).toString('base64url');tokens[name]=token;await d.insert(users).values({id,role,displayName:name});await d.insert(userSessions).values({userId:id,tokenHash:digest(token)});}
await d.insert(familyLinks).values([{parentId:actors[0][1],childId:actors[1][1]},{parentId:actors[2][1],childId:actors[3][1]}]);
const server=createServer((req,res)=>app.fetch(new Request(`http://127.0.0.1:4312${req.url}`,{method:req.method,headers:req.headers as HeadersInit,body:['GET','HEAD'].includes(req.method||'')?undefined:req,duplex:'half'} as RequestInit)).then(async x=>{res.statusCode=x.status;x.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await x.arrayBuffer()));}));await new Promise<void>(r=>server.listen(4312,'127.0.0.1',r));
const cases:any[]=[];let lastStart=0;async function hit(id:string,path:string,method='POST',token?:string,payload?:any){const wait=Math.max(0,1000-(Date.now()-lastStart));if(wait)await new Promise(r=>setTimeout(r,wait));lastStart=Date.now();const headers:Record<string,string>={};if(token)headers.authorization=`Bearer ${token}`;if(payload!==undefined)headers['content-type']='application/json';console.log('CASE_START',id);const start=performance.now();const res=await fetch(`http://127.0.0.1:4312${path}`,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});const raw=await res.text();let body:any;try{body=JSON.parse(raw)}catch{body={}};const item={id,status:res.status,responseBytes:new TextEncoder().encode(raw).length,durationMs:Number((performance.now()-start).toFixed(2)),body};cases.push(item);await appendFile(new URL('./boundary-progress.jsonl',import.meta.url),`${JSON.stringify(item)}\n`,'utf8');console.log('CASE_END',id,res.status);return body;}
const child=actors[1][1], parent=tokens.parentA, ct=tokens.childA;
const period=(name:string,expectedVersion:number,startDate:string,endDate=startDate)=>({childId:child,expectedVersion,name,startDate,endDate});
await hit('IN-03-blank','/api/test-period/create','POST',ct,period('',0,'2026-11-01'));
await hit('IN-03-whitespace','/api/test-period/create','POST',ct,period('   ',0,'2026-11-01'));
const maxName='m'.repeat(120);const created=await hit('IN-03-max-120','/api/test-period/create','POST',ct,period(maxName,0,'2026-11-01'));let version=created.configVersion??0;
await hit('IN-03-max-plus-one','/api/test-period/create','POST',ct,period('m'.repeat(121),version,'2026-11-02'));
const emoji='😀'.repeat(60);const emojiCreated=await hit('IN-03-emoji-60','/api/test-period/create','POST',ct,period(emoji,version,'2026-11-02'));version=emojiCreated.configVersion??version;
const combining='e\u0301'.repeat(60);const combiningCreated=await hit('IN-03-combining-60','/api/test-period/create','POST',ct,period(combining,version,'2026-11-03'));version=combiningCreated.configVersion??version;
await hit('IN-04-invalid-format','/api/test-period/create','POST',ct,period('bad date',version,'2026-13-01'));
await hit('IN-04-reversed','/api/test-period/create','POST',ct,period('reversed',version,'2026-10-20','2026-10-19'));
await hit('IN-04-extreme-past','/api/usage/get','POST',parent,{childId:child,from:'0001-01-01',to:'0001-01-01'});
await hit('IN-04-extreme-future','/api/usage/get','POST',parent,{childId:child,from:'9999-12-31',to:'9999-12-31'});
const zero=await hit('IN-05-zero','/api/plan/usual-limit','POST',parent,{childId:child,expectedVersion:version,usualLimitMinutes:0});version=zero.configVersion??version;
for(const [label,value] of [['decimal',1.5],['huge',9999999999],['string','5'],['null',null],['array',[5]]] as const){await hit(`IN-05-${label}`,'/api/plan/save','POST',parent,{childId:child,expectedVersion:version,planStartDate:'2026-10-18',startLimitMinutes:value,finalGoalMinutes:0});}
await hit('IN-05-usage-negative','/api/usage/upload','POST',ct,{submissionId:'93000000-0000-4000-8000-000000000001',childId:child,days:[{date:'2026-10-18',measuredAt:new Date().toISOString(),restrictedMinutes:-1,apps:[]}]});
for(const [label,packageName] of [['whitespace','   '],['max-plus-one','p'.repeat(256)],['control','com.example.\u0001app']] as const){await hit(`IN-06-${label}`,'/api/child-apps/upload','POST',ct,{childId:child,apps:[{packageName,label:'synthetic app'}]});}
const pattern={date:'2026-10-18',measuredAt:new Date().toISOString(),restrictedMinutes:5,apps:[{packageName:'com.example.shared',label:'Shared pattern',usedMinutes:5,excluded:false}]};
await hit('PII-08-same-pattern-A','/api/usage/upload','POST',ct,{submissionId:'94000000-0000-4000-8000-000000000001',childId:child,days:[pattern]});
await hit('PII-08-same-pattern-B','/api/usage/upload','POST',tokens.childB,{submissionId:'94000000-0000-4000-8000-000000000002',childId:actors[3][1],days:[pattern]});
const ua=await hit('PII-08-same-pattern-read-A','/api/usage/get','POST',parent,{childId:child,from:'2026-10-18',to:'2026-10-18'});
const ub=await hit('PII-08-same-pattern-read-B','/api/usage/get','POST',tokens.parentB,{childId:actors[3][1],from:'2026-10-18',to:'2026-10-18'});
cases.push({id:'PII-08-same-pattern-isolation',status:ua.days?.[0]?.apps?.[0]?.label===ub.days?.[0]?.apps?.[0]?.label&&ua.childId!==ub.childId?'family-scoped':'unexpected',body:{parentAChildId:ua.childId,parentBChildId:ub.childId,parentAAppCount:ua.days?.[0]?.apps?.length,parentBAppCount:ub.days?.[0]?.apps?.length}});
await new Promise<void>(r=>server.close(()=>r()));await writeFile(new URL('./boundary-evidence.json',import.meta.url),`${JSON.stringify({server:'127.0.0.1:4312',database:'ephemeral PGlite',minRequestStartIntervalMs:1000,cases},null,2)}\n`,'utf8');console.log(`Boundary evidence written: ${cases.length} observations.`);
