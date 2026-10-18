import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const adb = 'C:/Users/<user>/AppData/Local/Android/Sdk/platform-tools/adb.exe';
export function command(args) {
  const r = spawnSync(adb, ['-s', 'emulator-5556', ...args], { maxBuffer: 24 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return r.stdout;
}
const tag = process.argv[2];
if (tag) {
  if (!/^[a-z0-9-]+$/.test(tag)) throw new Error('Invalid evidence label');
  await new Promise(resolve => setTimeout(resolve, 700));
  command(['shell', 'uiautomator', 'dump', '/sdcard/slope-security-window.xml']);
  let xml = command(['exec-out', 'cat', '/sdcard/slope-security-window.xml']).toString();
  xml = xml.replace(/mock-token-[a-z-]+/g, '[REDACTED]');
  writeFileSync(new URL(`./${tag}.xml`, import.meta.url), xml);
  const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map(x => {
    const attrs = Object.fromEntries([...x[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    return { text: attrs.text, description: attrs['content-desc'], bounds: attrs.bounds, clickable: attrs.clickable };
  }).filter(x => x.text || x.description || x.clickable === 'true');
  console.log(JSON.stringify(nodes, null, 2));
  // Screenshots only when explicitly requested after confirming no QR/secrets on screen.
  if (process.argv.includes('--safe-screen')) writeFileSync(new URL(`./${tag}.png`, import.meta.url), command(['exec-out', 'screencap', '-p']));
}
