import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const adb='C:/Users/adach_oo8puoz/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const pkg='com.quedotcom.androidslope';
const run=args=>spawnSync(adb,['-s','emulator-5556','shell',...args],{maxBuffer:4*1024*1024,timeout:15000});
const read=run(['test','-r',`/data/data/${pkg}/databases/RKStorage`]);
const service=run(['am','startservice','-n',`${pkg}/dev.hackathon.kit.kitnative.engine.MonitorService`]);
const provider=run(['content','query','--uri',`content://${pkg}.androidx-startup`]);
const pid=run(['pidof',pkg]).stdout.toString().trim();
const result={time:new Date().toISOString(),shellUidCanReadAppDatabase:read.status===0,
  privateServiceRejected:/not exported|permission denial|permission denied/i.test(service.stdout+' '+service.stderr),
  privateProviderRejected:/not exported|permission denial|permission denied/i.test(provider.stdout+' '+provider.stderr),
  credentialValuesOrAppDataCopiedToReport:false};
if (/^\d+$/.test(pid)) {
  for (const [name,pattern] of [['syntheticTokenLogLines','mock-token-'],['fatalExceptionLogLines','FATAL EXCEPTION'],['bearerCredentialLogLines','Bearer[[:space:]]+[A-Za-z0-9._-]{8,}']]) {
    const r=run([`logcat -d --pid=${pid} -t 2000 | grep -E -c '${pattern}'`]);
    const value=r.stdout.toString().trim();
    result[name]=/^\d+$/.test(value)?Number(value):'unavailable';
  }
}
writeFileSync(new URL('./platform-probe.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
