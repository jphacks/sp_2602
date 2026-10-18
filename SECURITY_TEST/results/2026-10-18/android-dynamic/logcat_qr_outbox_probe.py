"""Scan recent Logcat lines after QR issue/cancel, child login, notification, and multi-item outbox sync."""
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ADB = r'C:\Users\adach_oo8puoz\AppData\Local\Android\Sdk\platform-tools\adb.exe'
OUT = Path(__file__).resolve().parent

pid_r = subprocess.run([ADB, '-s', 'emulator-5556', 'shell', 'pidof', 'com.quedotcom.androidslope'], capture_output=True, text=True, encoding='utf-8')
app_pid = pid_r.stdout.strip().split()[0]
if not app_pid.isdigit():
    raise RuntimeError('Slope PID not found')

def count_pattern(pattern: str) -> int:
    r = subprocess.run(
        [ADB, '-s', 'emulator-5556', 'shell', f"logcat -d --pid={app_pid} -t 4000 | grep -E -c '{pattern}'"],
        capture_output=True,
        text=True,
        encoding='utf-8',
    )
    out = r.stdout.strip()
    return int(out) if out.isdigit() else 0

evidence = {
    'executedAt': datetime.now(timezone.utc).isoformat(),
    'appPid': int(app_pid),
    'linesSampled': 4000,
    'rawLogCopiedToReport': False,
    'syntheticTokenMatches': count_pattern('mock-token-'),
    'bearerHeaderMatches': count_pattern('Bearer[[:space:]]+[A-Za-z0-9._-]{8,}'),
    'qrHex40CodeMatches': count_pattern('pairClaim|codeHash|\"code\":\"[0-9a-f]{40}\"'),
    'fatalExceptionMatches': count_pattern('FATAL EXCEPTION'),
}
(OUT / 'logcat-qr-outbox-probe.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
print(json.dumps(evidence, indent=2))
