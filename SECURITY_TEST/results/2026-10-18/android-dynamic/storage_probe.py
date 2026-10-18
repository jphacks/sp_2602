"""Inspect synthetic token markers inside the AVD; no raw app data leaves it."""
import json
import shlex
import subprocess
import sys
from pathlib import Path
ADB = r'C:\Users\adach_oo8puoz\AppData\Local\Android\Sdk\platform-tools\adb.exe'
PACKAGE = 'com.quedotcom.androidslope'
def run(*args):
    return subprocess.run([ADB, '-s', 'emulator-5556', 'shell', 'run-as', PACKAGE, *args], capture_output=True)
def marker(path):
    r = run('grep', '-a', '-q', 'mock-token-', path)
    return {'syntheticTokenMarkerPresent': r.returncode == 0, 'probeSucceeded': r.returncode in (0, 1) and not r.stderr.strip()}
result = {'package': PACKAGE, 'rawAppDataCopiedOutsideAvd': False, 'database': marker('databases/RKStorage'), 'activeSessionRowState': 'not inferred from raw marker; see UI/API checks'}
query = """SELECT json_object('sessionRows',(SELECT count(*) FROM catalystLocalStorage WHERE key='slope.session'),'role',(SELECT json_extract(value,'$.role') FROM catalystLocalStorage WHERE key='slope.session'),'configRows',(SELECT count(*) FROM catalystLocalStorage WHERE key LIKE 'slope.config.%'),'outboxEntries',coalesce((SELECT json_array_length(value) FROM catalystLocalStorage WHERE key='slope.usage-outbox'),0));"""
summary = run('sqlite3', '-readonly', 'databases/RKStorage', shlex.quote(query))
if summary.returncode == 0:
    result['safeDatabaseSummary'] = json.loads(summary.stdout)
else:
    result['safeDatabaseSummaryUnavailable'] = True
queue_query = """SELECT coalesce(json_group_array(json_object('state',json_extract(j.value,'$.state'),'attempts',json_extract(j.value,'$.attempts'),'nextAttemptAt',json_extract(j.value,'$.nextAttemptAt'),'errorCode',json_extract(j.value,'$.lastError.code'),'dayCount',json_array_length(j.value,'$.days'))),'[]') FROM catalystLocalStorage c, json_each(c.value) j WHERE c.key='slope.usage-outbox';"""
queue = run('sqlite3', '-readonly', 'databases/RKStorage', shlex.quote(queue_query))
if queue.returncode == 0:
    result['safeOutboxMetadata'] = json.loads(queue.stdout)
listing = run('ls', 'shared_prefs')
result['preferences'] = []
if listing.returncode == 0:
    for name in listing.stdout.decode().splitlines():
        if name.endswith('.xml') and all(c.isalnum() or c in '._-' for c in name):
            result['preferences'].append({'file': name, **marker('shared_prefs/' + name)})
label = sys.argv[1]
if not label.replace('-', '').isalnum():
    raise ValueError('Invalid label')
Path(__file__).with_name(label + '.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, indent=2))
