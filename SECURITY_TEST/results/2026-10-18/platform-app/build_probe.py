"""Build a permissionless test APK using the already installed isolated SDK."""
from pathlib import Path
import hashlib
import json
import os
import secrets
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[4]
SOURCE = Path(__file__).resolve().parent
WORK = ROOT / 'tmp' / 'security-platform-probe'
WORK.mkdir(parents=True, exist_ok=True)
SDK = ROOT / 'tmp' / 'security-sdk'
BUILD = SDK / 'build-tools' / '36.0.0'
JAVA = Path(r'C:\Users\adach_oo8puoz\AppData\Local\Programs\Android\android-studio\jbr')
env = dict(os.environ, JAVA_HOME=str(JAVA), SLOPE_PROBE_KEYPASS=secrets.token_urlsafe(24))
android_jar = SDK / 'platforms' / 'android-37.0' / 'android.jar'
classes = WORK / 'classes'
dex = WORK / 'dex'
classes.mkdir(exist_ok=True)
dex.mkdir(exist_ok=True)
def run(args):
    subprocess.run([str(x) for x in args], env=env, check=True, capture_output=True, timeout=120)

run([JAVA/'bin/javac.exe', '--release', '8', '-classpath', android_jar, '-d', classes, SOURCE/'ProbeActivity.java'])
run([BUILD/'d8.bat', '--lib', android_jar, '--min-api', '24', '--output', dex,
     classes/'local/slope/securityprobe/ProbeActivity.class'])
unsigned = WORK/'probe-unsigned.apk'
run([BUILD/'aapt2.exe', 'link', '-I', android_jar, '--manifest', SOURCE/'AndroidManifest.xml', '-o', unsigned])
with zipfile.ZipFile(unsigned, 'a') as archive:
    archive.write(dex/'classes.dex', 'classes.dex')
key = WORK/('probe-' + secrets.token_hex(6) + '.jks')
run([JAVA/'bin/keytool.exe', '-genkeypair', '-keystore', key, '-storepass:env', 'SLOPE_PROBE_KEYPASS',
     '-keypass:env', 'SLOPE_PROBE_KEYPASS', '-alias', 'local-probe', '-keyalg', 'RSA', '-keysize', '2048',
     '-validity', '7', '-dname', 'CN=Local Synthetic Security Probe', '-noprompt'])
apk = WORK/'probe.apk'
run([BUILD/'apksigner.bat', 'sign', '--ks', key, '--ks-pass', 'env:SLOPE_PROBE_KEYPASS',
     '--key-pass', 'env:SLOPE_PROBE_KEYPASS', '--out', apk, unsigned])
run([BUILD/'apksigner.bat', 'verify', apk])
result = {'apk': str(apk), 'sha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
          'permissionsRequested': [], 'separateSyntheticSigningKey': True, 'signatureVerified': True}
(SOURCE/'build-evidence.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result))

