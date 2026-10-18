"""Test multi-item usage outbox recovery, duplicate submission IDs, and partial permanent-error quarantine on AVD."""
import json
import shlex
import subprocess
import time
import urllib.request
from pathlib import Path
from datetime import datetime, timezone

ADB = r'C:\Users\<user>\AppData\Local\Android\Sdk\platform-tools\adb.exe'
PACKAGE = 'com.quedotcom.androidslope'
OUT = Path(__file__).resolve().parent

def run_as(*args):
    return subprocess.run([ADB, '-s', 'emulator-5556', 'shell', 'run-as', PACKAGE, *args], capture_output=True, text=True, encoding='utf-8')

def get_outbox():
    q = "SELECT coalesce((SELECT value FROM catalystLocalStorage WHERE key='slope.usage-outbox'),'[]');"
    r = run_as('sqlite3', '-readonly', 'databases/RKStorage', shlex.quote(q))
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout.strip() or '[]')

def get_session_meta():
    q = "SELECT json_object('userId',json_extract(value,'$.userId'),'role',json_extract(value,'$.role')) FROM catalystLocalStorage WHERE key='slope.session';"
    r = run_as('sqlite3', '-readonly', 'databases/RKStorage', shlex.quote(q))
    if r.returncode != 0 or not r.stdout.strip():
        raise RuntimeError('No active child session in RKStorage')
    return json.loads(r.stdout.strip())

def sanitize_outbox(items):
    return [
        {
            'submissionId': x.get('submissionId'),
            'state': x.get('state'),
            'attempts': x.get('attempts'),
            'nextAttemptAt': x.get('nextAttemptAt'),
            'errorCode': (x.get('lastError') or {}).get('code'),
            'dayDates': [d.get('date') for d in (x.get('days') or []) if isinstance(d, dict)],
        }
        for x in items
    ]

meta = get_session_meta()
child_id = meta['userId']
now_iso = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')

# Prepare 3 synthetic outbox entries:
# 1. Valid record A (2026-10-17) - simulating prior network failure (attempts=1, nextAttemptAt in the past so it is due now)
# 2. Duplicate submissionId of a pre-seeded upload (2026-10-16) - tests idempotent duplicate handling on flush
# 3. Permanent error record (forged other childId) - tests that permanent failure quarantines only this item while 1 and 2 succeed and clear
sub_valid_1 = '11111111-2222-4333-8444-555555555501'
sub_valid_2 = '11111111-2222-4333-8444-555555555502'
sub_perm_err = '11111111-2222-4333-8444-555555555503'

seeded_items = [
    {
        'submissionId': sub_valid_1,
        'childId': child_id,
        'createdAt': '2026-10-18T05:00:00.000Z',
        'attempts': 1,
        'nextAttemptAt': '2026-10-18T05:00:30.000Z',
        'state': 'pending',
        'lastError': {'code': 'network', 'message': '送信できませんでした'},
        'days': [
            {
                'date': '2026-10-17',
                'restrictedMinutes': 15,
                'measuredAt': '2026-10-17T12:00:00.000Z',
                'apps': [{'packageName': 'com.android.settings', 'label': 'Settings', 'usedMinutes': 15, 'excluded': False}],
            }
        ],
    },
    {
        'submissionId': sub_valid_2,
        'childId': child_id,
        'createdAt': '2026-10-18T05:01:00.000Z',
        'attempts': 2,
        'nextAttemptAt': '2026-10-18T05:02:00.000Z',
        'state': 'pending',
        'lastError': {'code': 'network', 'message': '送信できませんでした'},
        'days': [
            {
                'date': '2026-10-18',
                'restrictedMinutes': 5,
                'measuredAt': '2026-10-18T05:00:00.000Z',
                'apps': [{'packageName': 'com.android.settings', 'label': 'Settings', 'usedMinutes': 5, 'excluded': False}],
            }
        ],
    },
    {
        'submissionId': sub_perm_err,
        'childId': '00000000-0000-4000-8000-000000000999',
        'createdAt': '2026-10-18T05:01:30.000Z',
        'attempts': 0,
        'nextAttemptAt': '2026-10-18T05:01:30.000Z',
        'state': 'pending',
        'lastError': None,
        'days': [
            {
                'date': '2026-10-18',
                'restrictedMinutes': 10,
                'measuredAt': '2026-10-18T05:01:00.000Z',
                'apps': [{'packageName': 'com.android.settings', 'label': 'Settings', 'usedMinutes': 10, 'excluded': False}],
            }
        ],
    },
]

DEV_URI = 'exp+slope://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081'

def write_outbox_stopped(items):
    subprocess.run([ADB, '-s', 'emulator-5556', 'shell', 'am', 'force-stop', PACKAGE], check=True)
    time.sleep(0.5)
    payload = json.dumps(items, ensure_ascii=False).replace("'", "''")
    sql = f"PRAGMA wal_checkpoint(TRUNCATE); INSERT OR REPLACE INTO catalystLocalStorage (key, value) VALUES ('slope.usage-outbox', '{payload}'); PRAGMA wal_checkpoint(TRUNCATE);"
    w = run_as('sqlite3', 'databases/RKStorage', shlex.quote(sql))
    if w.returncode != 0:
        raise RuntimeError(w.stderr)
    run_as('rm', '-f', 'databases/RKStorage-wal', 'databases/RKStorage-shm')

def launch_and_wait():
    subprocess.run([ADB, '-s', 'emulator-5556', 'shell', 'am', 'start', '-n', 'com.quedotcom.androidslope/.MainActivity', '-a', 'android.intent.action.VIEW', '-d', DEV_URI], check=True, capture_output=True)
    time.sleep(20.0)

write_outbox_stopped(seeded_items)
before_flush = sanitize_outbox(get_outbox())

launch_and_wait()
after_first_flush = sanitize_outbox(get_outbox())

# Re-insert sub_valid_1 (already accepted on server) while app is stopped to verify duplicate submissionId on device is also cleared on flush
reinsert = [seeded_items[0]] + get_outbox()
write_outbox_stopped(reinsert)
before_duplicate_flush = sanitize_outbox(get_outbox())

launch_and_wait()
after_duplicate_flush = sanitize_outbox(get_outbox())

# Clean up the synthetic quarantined item so outbox returns to clean 0 state
write_outbox_stopped([])
cleaned_outbox = sanitize_outbox(get_outbox())

evidence = {
    'executedAt': datetime.now(timezone.utc).isoformat(),
    'beforeFirstFlush': before_flush,
    'afterFirstFlush': after_first_flush,
    'beforeDuplicateFlush': before_duplicate_flush,
    'afterDuplicateFlush': after_duplicate_flush,
    'cleanedOutbox': cleaned_outbox,
}
(OUT / 'multi-outbox-evidence.json').write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps(evidence, indent=2, ensure_ascii=False))
