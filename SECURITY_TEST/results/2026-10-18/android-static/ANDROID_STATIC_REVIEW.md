# Android client static security review

- Date: 2026-10-18
- Repository revision: `0ddfc7e` (`security/android-security-test-plan`)
- Scope: Android/React Native client source, Expo configuration, native Android module source. No build, ADB, emulator, API request, or production connection was performed.
- Result convention: `STATIC FAIL` means source/config contradicts a stated security requirement; `STATIC GAP` means a required client control is absent but the effective merged APK policy is unknown; `BLOCKED` means runtime/APK evidence is unavailable. No dynamic case is marked PASS.

## Environment handoff

- App: Expo / React Native, package ID `com.quedotcom.androidslope` (`app.json:9-13`); URI scheme `slope` (`app.json:7`).
- APK: no `.apk` artifact and no generated root `android/` project are present in this checkout. Expected local Expo prebuild debug output, if built separately, is `android/app/build/outputs/apk/debug/app-debug.apk`; this path is an expectation, not an observed artifact.
- API override: `EXPO_PUBLIC_API_URL`; default is `http://10.0.2.2:3000` (`src/lib/api.ts:20-21`). A packaged app embeds this build-time value; the source has no runtime HTTPS-only enforcement.
- Login for an isolated local test: if `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is unset, the app offers mock parent/child choices (`src/lib/google.ts:9-12,57-62`; `src/app/login.tsx:73-87`). Server accepts `mock-` IDs only when `MOCK=1` (`src/server/handlers/authGoogle.ts:2,11-16`). Do not use these choices against a non-local backend.

## Findings

### AND-05 / PII-05 / PII-10: session and child reporter credentials are stored without encryption — STATIC FAIL

- The JS app persists the complete `Session`, including its bearer token, via AsyncStorage (`src/lib/session.tsx:53-56`; `src/lib/storage.ts:1-2,8,18,21-22`).
- The native monitoring reporter stores its URL, token, and child ID in app-private `SharedPreferences` (`modules/kit-native/android/src/main/java/dev/hackathon/kit/kitnative/engine/EngineStore.kt:63,82,146-178`). `MODE_PRIVATE` restricts other ordinary apps, but does not encrypt values at rest or provide Android Keystore-backed protection.
- Logout code attempts local user data cleanup and clears native state (`src/lib/session.tsx:109-121`; `EngineStore.kt:183-198`), but persistence/deletion across actual process restart and account switching remains BLOCKED pending device testing.
- Backup exclusion is present: `app.json:11-12` sets `allowBackup:false`; `plugins/with-android-no-backup.ts:32-44,54-56` additionally excludes listed domains from cloud backup and device transfer. Generated APK manifest and actual platform behavior remain BLOCKED.

### NET-01: client HTTPS enforcement is absent; effective release cleartext policy is unverified

- `src/lib/api.ts:20-21` accepts `EXPO_PUBLIC_API_URL` without scheme validation and uses HTTP by default. Client-side HTTPS enforcement is absent.
- This source finding does not prove Android cleartext traffic is enabled in the generated release APK: the merged manifest / network security policy and release build URL are unavailable here. The local default is appropriate only for an emulator/local development test. NET-01 effective release behavior and NET-02 TLS behavior are BLOCKED pending APK inspection.

### AND-01 / AND-02 / AND-03 / AND-12: APK manifest and packaged strings — BLOCKED

- Expo generates the app manifest during prebuild. `modules/kit-native/android/src/main/AndroidManifest.xml` is a library manifest, not the merged application APK manifest. It declares an exported widget receiver, an exported device-admin receiver guarded by `BIND_DEVICE_ADMIN`, boot receivers, and a release receiver guarded by `DUMP`; internal services/receiver are explicitly non-exported. These source declarations alone cannot establish the final merged manifest or deep-link behavior.
- `app.json:7` registers `slope`; source has no APK here to inspect exported Expo Router activities, merged permissions, embedded environment strings, or signing/build variant.

## Case mapping (client side)

| Plan IDs | Static assessment | Dynamic status |
|---|---|---|
| AND-01, AND-02, AND-03, AND-12 | Generated APK manifest/deep-link/build inspection required; library manifest is partial | BLOCKED |
| AND-04, AND-05 | AND-05 has the plaintext-storage finding above; logout/restart behavior needs a device | BLOCKED |
| AND-06, AND-07, AND-08, AND-09, AND-10, AND-11, AND-13, AND-14 | Requires interaction, Logcat, OS settings, or merged package behavior | BLOCKED |
| NET-01 | Client HTTPS enforcement is absent; effective release policy/build URL not inspected | STATIC GAP; effective behavior BLOCKED |
| NET-02, NET-03, NET-04, NET-05, NET-06, NET-07, NET-08 | TLS/proxy, retransmit, offline/cache, logout, and actual error behavior require runtime | BLOCKED |
| PII-04 | No runtime logs/crash/analytics inspected | BLOCKED |
| PII-05 | AsyncStorage and native reporter credential storage are source-visible; actual files and account-switch deletion not inspected | STATIC FAIL for at-rest protection; remaining behavior BLOCKED |
| PII-06, PII-07, PII-09, PII-10 | Deep-link/UI/log/error/QR/deletion behavior not dynamically inspected | BLOCKED |

## Evidence and limits

- Evidence is source/config only; no secrets, account tokens, personal data, or environment file values were read into this report.
- No code or build configuration was changed. No tests/builds were run, as assigned.
- This review does not establish that a release APK is currently configured with the insecure HTTP default; it establishes that source accepts that value without a release guard.


## Selected client test checks (2026-10-18)

Safety preflight: `vitest.config.ts` sets `MOCK=1`, stubs `expo/fetch` and AsyncStorage for Node tests, and uses a PGlite temporary template. Before running, the process environment had no `DATABASE_URL`, `LOCAL_DB_DIR`, or `VERCEL_ENV`; `.env` and `.env.local` were absent. `src/server/db/index.ts` selects Neon only when `DATABASE_URL` exists and guards test DB reset against that variable. The selected API/outbox tests replace fetch with in-process/mocked responses; no external API request was made.

Command: `npx vitest run tests/lib/sign-out.test.ts tests/lib/usage-outbox.test.ts tests/lib/api-timeout.test.ts tests/lib/api.test.ts tests/lib/config-cache.test.ts tests/plugins/release-signing.test.ts`

Result: **6 test files passed, 73 tests passed**, duration 8.74s. This is Node/unit evidence only; it is not an Android APK/emulator result.

- **NET-04 / AVL-03:** `tests/lib/usage-outbox.test.ts` and `tests/lib/api-timeout.test.ts` exercise stable submission IDs, retry/backoff after transient errors, accepted-item removal, and repeated flush behavior with fake storage/send functions. This does not send a real HTTP request.
- **NET-05:** `tests/lib/api-timeout.test.ts` simulates fetch abort/offline timeout and later retry; no Android airplane-mode or network recovery was tested.
- **NET-06:** `tests/lib/config-cache.test.ts` covers stale cached data and late older response handling; no device timing/network proxy test was performed.
- **NET-07 / PII-05 / AND-04:** `tests/lib/sign-out.test.ts` verifies local cache/outbox cleanup and server session revocation against in-process app/PGlite behavior. `tests/lib/api.test.ts` checks 401 logout signaling and stale-token race handling. It does not establish encrypted storage or verify actual Android files, restart, back navigation, or another installed user's state.
- **Plugin checks:** `tests/plugins/release-signing.test.ts` passes release-signing Gradle transformation checks. No Android no-backup plugin test exists in `tests/plugins`; backup behavior is supported by source configuration only, and the merged manifest/device transfer remain unverified.

No tests or source were edited. No APK install, ADB, emulator, or dynamic network inspection was performed in this subtask.


