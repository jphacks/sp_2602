"""Bounded unauthenticated intent probes on the dedicated AVD only."""
import json
import subprocess
import time
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
ADB = r'C:\Users\<user>\AppData\Local\Android\Sdk\platform-tools\adb.exe'
COMPONENT = 'com.quedotcom.androidslope/.MainActivity'
cases = [
    ('missing-uri-forged-role', ['--es', 'role', 'parent', '--ei', 'childId', '7']),
    ('parent-plan-uri', ['-a', 'android.intent.action.VIEW', '-d', 'slope:///parent/plan?childId=synthetic-other-family&role=parent']),
    ('pair-status-uri', ['-a', 'android.intent.action.VIEW', '-d', 'slope:///pair/status?pairId=synthetic-other-pair&role=parent']),
    ('pair-setting-uri', ['-a', 'android.intent.action.VIEW', '-d', 'slope:///pair/usual-limit?childId=synthetic-other-family']),
    ('unexpected-host', ['-a', 'android.intent.action.VIEW', '-d', 'slope://unexpected.invalid/parent/settings']),
    ('bounded-extra-16k', ['--es', 'role', 'parent', '--es', 'payload', 'x' * 16384]),
]
results = []
for name, arguments in cases:
    started = subprocess.run([ADB, '-s', 'emulator-5556', 'shell', 'am', 'start', '-n', COMPONENT, *arguments], capture_output=True, timeout=20)
    time.sleep(1)
    subprocess.run(['node', str(OUT/'device.mjs'), 'intent-' + name], capture_output=True, check=True, timeout=25)
    tree = ElementTree.fromstring((OUT/('intent-' + name + '.xml')).read_text(encoding='utf-8'))
    labels = [(n.get('text', '') + ' ' + n.get('content-desc', '')).replace('\u2060', '') for n in tree.iter('node')]
    login_visible = any('保護者としてログイン（デモ）' in x for x in labels) and any('子どもとしてログイン（デモ）' in x for x in labels)
    results.append({'case': name, 'amExitCode': started.returncode, 'loginControlsVisible': login_visible,
                    'parentHeadingVisible': any('Slope（親）' in x for x in labels)})
    print(json.dumps(results[-1]), flush=True)
(OUT/'intent-followup.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
