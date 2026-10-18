# Security test coverage matrix (independent draft)

**Snapshot:** 2026-10-18. Drafted from `api/REPORT.md`, adjacent backend health evidence, `android-static/`, `android-dynamic/`, the review notes, and the parent-provided installed-device observations. This is an evidence map, not a completion declaration. No ADB, network, database, or test scripts were run for this matrix.

## Environment and scope

- Installed debug app: Slope 1.0.0, `com.quedotcom.androidslope`, SHA-256 `30D32BF85B749086E4705DBFD6F22343043AA1429E5632FDAFB2A884F5EDDF3A` (as provided by parent); `SlopeVerify`, Android API 37.
- Debug local API: loopback `127.0.0.1:4313` through ADB reverse, isolated memory PGlite, synthetic parent/child identities and tokens. API runner observations on 4311/4312 are a separate PGlite run.
- Do not infer release behavior from debug: no release APK was inspected; a release merged manifest was subsequently generated and inspected. API runner deviations and limits are retained in `../api/REPORT.md`.
- Later device follow-ups evidenced single-item and multi-item outbox recovery (`NET-04`, `NET-05`, `AVL-03` PASS), QR cancel/reissue/signOut lifecycle (`PII-09` PASS), notification and window-flag inspection, and classification of remaining BLOCKED items. See `../android-dynamic/FOLLOWUP.md` and `../android-dynamic/POST_RESUME_2.md`.

**Status rules:** PASS means the tested criterion in the plan is fully evidenced for its stated scope. FAIL means a recorded contradiction. BLOCKED means only a subset, prerequisite, or dynamic verification is missing. N/A is conditional and applies only if the feature/authentication model is absent; re-evaluate when scope changes.

## PII cases (10)

| ID | Status | Evidence and scope / remaining |
|---|---|---|
| PII-01 | BLOCKED | Synthetic Parent A/B family reads returned only their own child (`api/supplemental-evidence.json`, `PII-01`). All other API responses/roles were not compared. |
| PII-02 | BLOCKED | Cross-family config read/write denied with no state change (`API-04/05`); history/detail/aggregate variants were not all exercised. |
| PII-03 | BLOCKED | Family/config response slices inspected; no full API DTO and UI inventory. |
| PII-04 | BLOCKED (expanded 4,000-line sample passed) | Selected 2,000-line and post-QR/notification/outbox 4,000-line AVD Logcat samples for the app PID had zero synthetic/Bearer token, zero 40-hex QR code, and zero FATAL lines (`android-dynamic/platform-probe.json`, `android-dynamic/logcat-qr-outbox-probe.json`). Does not establish absence on every path. |
| PII-05 | FAIL | Signed-in parent/child synthetic token marker found in app SQLite; child reporter token marker also found in `slope_engine.xml`. Values remain app-private but are unencrypted. Parent and child logout snapshots show session/config/outbox counts at zero and token markers absent; both old tokens received 401 (`parent-signed-in-storage.json`, `child-signed-in-storage.json`, `parent-logged-out-storage.json`, `parent-token-after-logout.json`, `child-logged-out-storage.json`, `child-token-after-logout.json`). |
| PII-06 | BLOCKED (notification & QR cancel verified; Recents policy pending) | Unauthenticated malformed-role deep link stayed at login; clipboard/share/export are absent; `MonitorService` notification showed only percentage (`今日は 3% 使いました`) without raw minutes/apps/tokens; QR screen had no plain code in accessibility text, and cancel/reissue invalidated old QR codes server-side. However, `Window#8` lacks `FLAG_SECURE`, so Recents/screenshot protection policy remains pending (`../android-dynamic/POST_RESUME_2.md`). |
| PII-07 | BLOCKED | Sample API error bodies were generic; app/HTTP/log checks across invalid ID, DB failure, expiry and token leakage are incomplete. DB-close emitted internal diagnostics to server stderr. |
| PII-08 | BLOCKED (usage API slice passed) | Two synthetic families with identical usage pattern returned only their own record through parent-scoped reads (`input-remainder-evidence.json`). Android rendering and broader aggregation remain untested. |
| PII-09 | PASS (one-use, expiry, cancel, and reissue invalidation) | API one-use/replay and expiry returned 409; device UI cancel sent `POST /api/pair/cancel` (200) and subsequent claim of the cancelled code returned 409; reissuing a new QR invalidated both `waiting` and `claimed` prior tickets (409 on claim/confirm); app PID Logcat had 0 QR secret matches (`../api-followup/qr-lifecycle-evidence.json`, `../android-dynamic/POST_RESUME_2.md`). Note: if `signOut` occurs without `pairCancel`, the ticket remains claimable until its 10-min TTL, though `pairConfirm` fails 401 so linking cannot complete. |
| PII-10 | BLOCKED (unlink slice passed; retention policy pending) | Synthetic family unlink removed the link, reset child role, deleted `deviceStatuses`, expired pending QR tickets, and revoked child sessions (`pii10-evidence.json`). Historical usage/config/app-list retention on unlink is marked `TODO(未決)` in `src/server/auth.ts:510`. |

## API cases (12)

| ID | Status | Evidence and scope / remaining |
|---|---|---|
| API-01 | PASS | 34 protected routes each returned the same generic 401/144-byte body, with request starts at least ~1 s apart (`../android-dynamic/unauthenticated-matrix.json`). Health and intentional unauthenticated login endpoints are outside this protected-route matrix. |
| API-02 | PASS (opaque session credentials) | Empty/malformed/unknown credentials and idle-expired session were rejected with generic 401. Installed parent/child revoked tokens also got401. The implementation uses opaque DB-digested secrets, so a JWT-signature variant is N/A; provider OAuth validation remains outside this case. See ../api-followup/REPORT.md and evidence.json. |
| API-03 | PASS | Child parent-only setting save got 403; parent settings/version reads before and after were unchanged (`api/REPORT.md`, `supplemental-evidence.json`). |
| API-04 | PASS (config + usage reads) | Parent A cross-family config read was403; added actual usage/history read was403 without the synthetic marker. Parent B control read was200 with its own marker. See ../api-followup/evidence.json plus earlier supplemental-evidence.json. |
| API-05 | PASS (config read/write) | Parent A cross-family config read/write denied; Child B settings/version unchanged (`supplemental-evidence.json`). |
| API-06 | PASS | Child A usage upload with Child B ID got 403 before persistence (`api/REPORT.md`). |
| API-07 | PASS | Forged role/owner/admin fields did not change saved user roles/family links; only allowed setting changed (`api/REPORT.md`). |
| API-08 | PASS (combined local evidence) | Isolated backend `/health`: 200 healthy, 503 when its local PostgreSQL stopped, 200 after restart; unknown route 404 (`../android-static/health/HEALTH_CHECK_RESULT.md`). App unauthenticated health/unknown/API auth checks are separately recorded. The API report has been reconciled to this later backend evidence. |
| API-09 | PASS | QR claim succeeded once, reuse/expiry returned 409, and the synthetic flow linked (`api/evidence.json`). |
| API-10 | PASS | Wrong synthetic child confirmation returned 404; pair existence was not revealed (`api/evidence.json`). |
| API-11 | PASS (single effect) | Successful `pairConfirm` then replay returned 409; recorded family link count stayed one. Meets no-duplicate-effect condition; identical-response/client retry UX is not claimed. |
| API-12 | BLOCKED | Invalid and valid-but-unlinked IDs had identical 403 bodies; only one timing sample each, insufficient for timing/size/response-difference conclusion. |

## Input / business-rule cases (12)

| ID | Status | Evidence and scope / remaining |
|---|---|---|
| IN-01 | PASS | SQL-looking synthetic display name was stored/read as literal text (`api/evidence.json`). |
| IN-02 | PASS (period list rendering) | Both script-like and img-onerror-like synthetic names were saved by the actual API and displayed literally in the Android list and edit fields, without observed alert/navigation. See ../android-dynamic/render-markers-api.json and parent-markup-list.xml/png, parent-script-detail.xml, parent-img-detail.xml. Scope is the tested name field/list. |
| IN-03 | PASS (test-period name boundary) | Blank/whitespace rejected; 120 chars, 60 emoji and 60 combining sequences accepted; 121 rejected (`boundary-progress.jsonl`). Earlier 40/41 boundary also recorded. Other fields are outside this result. |
| IN-04 | FAIL (bounded input expectation) | Invalid/malformed and reversed dates returned 400; extreme past usage read returned 200. Extreme future `9999-12-31` usage query yielded no HTTP response before the isolated runner was stopped. This contradicts the plan's extreme-date rejection expectation; no general DoS conclusion. `boundary-progress.jsonl` has no completion row for this request, so exact duration is unavailable. |
| IN-05 | BLOCKED (expanded minute boundaries) | Additional14 local requests tested usedMinutes/restrictedMinutes: zero200; negative, decimal, MAX_SAFE_INTEGER, string, null, array400 with no rejected-write row-count changes. Earlier limit-value checks cover selected plan fields. Every limit field combination is not covered. See ../api-followup/INPUT_MINUTES.md. Cumulative recorded IN05 requests >=21 exceeds planned20; deviation documented. |
| IN-06 | BLOCKED | `packageName` whitespace and 256 characters rejected; a control-character value was accepted 200. UI/log/storage side effects were not inspected. |
| IN-07 | PASS | Forged role/owner/admin fields ignored for authorization/state; direct DB role/link comparison unchanged (`api/REPORT.md`). |
| IN-08 | PASS | Same submission ID/payload returned duplicate; same ID/different payload returned 409 (`api/evidence.json`). |
| IN-09 | BLOCKED | Stale Android response/cache ordering is only unit-test evidence; no real device timing/network race. |
| IN-10 | BLOCKED | 27 calculation unit tests passed for selected boundaries; full HTTP/config combinations and undecided rules were not established. |
| IN-11 | PASS with execution deviation | Retained >8 MiB request returned 400 before route processing. Report says the probe ran three times across isolated runs; only one response is retained in listed evidence, and the plan's one-probe instruction was exceeded. |
| IN-12 | BLOCKED | Special log input/capture not performed. DB-close test produced server-side internal stack/query diagnostics but response remained generic; no saved secret was found. |

## Network / session cases (8)

| ID | Status | Evidence and scope / remaining |
|---|---|---|
| NET-01 | BLOCKED (release merged manifest added) | Debug APK uses localHTTP/cleartext true. Actual release merged Manifest has no debuggable/usesCleartextTraffic/networkSecurityConfig explicit attribute; dev activities removed. No signed release APK or live release HTTP/TLS policy test. See ../release-manifest/REPORT.md. |
| NET-02 | BLOCKED | No invalid-certificate proxy test or release TLS rejection test. |
| NET-03 | BLOCKED | No TLS proxy inspection of authorization/cookie handling. |
| NET-04 | PASS (device duplicate submissionId replay + 401 handling) | Re-queuing an already-accepted `submissionId` (`11111111-2222-4333-8444-555555555501`) on the Android device flushed with HTTP 200 (`duplicate`) without creating duplicate server records and cleared the item from device storage (`../android-dynamic/multi-outbox-evidence.json`, `../android-dynamic/POST_RESUME_2.md`). Expired/revoked token handling is evidenced in API-02/NET-07. |
| NET-05 | PASS (transport-fault method variation + multi-item partial clear) | Server-side local socket disconnect persisted pending item with backoff, then uploaded 200 and cleared outbox 0 after recovery (`../android-dynamic/FOLLOWUP.md`). Multi-item flush additionally confirmed that accepted items clear while a permanent-error item is quarantined without infinite retry (`../android-dynamic/multi-outbox-evidence.json`). Literal airplane mode not tested. |
| NET-06 | BLOCKED | Cache stale response test is unit-level only; no device network reordering. |
| NET-07 | PASS (parent and child logout) | Parent Back/cold start protected route remained gated and old token401. Child logout also cleared session/config/outbox counts and SQLite/native token markers, old token401. See ../android-dynamic/child-logged-out-storage.json and child-token-after-logout.json. |
| NET-08 | BLOCKED | Sample HTTP errors are generic; full device UI and response body checks for DB names, SQL, filesystem paths, stack traces and recovery are incomplete. |

## Android app / OS cases (14)

| ID | Status | Evidence and scope / remaining |
|---|---|---|
| AND-01 | BLOCKED (debug + release manifests inventoried) | Generated actual release merged manifest: exported8 versus debug11; three dev/tooling activities removed. Permission gates inventoried; private paths tested on debug from differentUID. Release APK and every exported input gate remain unverified. See ../release-manifest/REPORT.md. |
| AND-02 | BLOCKED | One malformed role extra/deep link left login; not all exported activities/receivers or oversized/missing extras tested. |
| AND-03 | PASS (product MainActivity URI samples) | Forged role/child/pair IDs and altered path remained behind login; unexpected host produced Unmatched Route, not a protected screen; wrong scheme remained behind login. See ../android-dynamic/intent-followup.json, intent-wrong-scheme.xml and POST_RESUME.md. Real OAuth/dev-client callbacks are not covered. |
| AND-04 | PASS (parent logout/restart slice) | Parent logout cleared its token marker; Back exited; cold restart returned to login; revoked parent token got 401. Child logout snapshot also shows session/config/outbox counts zero and no token marker, and its stale token returned 401. This does not cover every protected in-memory cache. |
| AND-05 | FAIL | Actual debug app SQLite contains signed-in synthetic bearer marker; child native reporter preferences contain token marker. Manifest disables backup/excludes domains, but does not encrypt these stored values. |
| AND-06 | BLOCKED (4,000-line app PID sample passed) | 2,000-line and post-QR/notification/outbox 4,000-line app-PID Logcat samples had zero synthetic token, Bearer, or 40-hex QR matches and no FATAL (`../android-dynamic/logcat-qr-outbox-probe.json`); exhaustive PII field logging across all screens not searched. |
| AND-07 | BLOCKED (notification & QR window checked; Recents policy pending) | Logged-in Recents preview showed synthetic parent usage minutes/limit/time and permission state, and QR screen (`Window#8`) also lacks `FLAG_SECURE`; after logout preview showed login only. Native foreground notification (`slope_engine`, ID 2600) showed only percentage (`今日は 3% 使いました`) with `vis=0` and no raw minutes/apps/tokens (`../android-dynamic/POST_RESUME_2.md`). Kept BLOCKED pending screen-protection policy decision. |
| AND-08 | N/A (conditional; no app export flow) | Archived source inventory found no app clipboard/share/file-export implementation. QR display and notification/recents exposure remain applicable under PII06/AND07, not this absent transfer flow. See ../privacy-followup/REPORT.md and parent integration note. |
| AND-09 | BLOCKED (usage access + camera slices) | Usage access denial showed explanation, grant showed real percentage, later default restored. Camera denial showed explanation; retry/one-time grant opened scanner; cancel returned to role choice; camera revoked after. Other permissions remain untested. See ../android-dynamic/FOLLOWUP.md. |
| AND-10 | BLOCKED | Special permissions are declared (overlay/full-screen/battery exemption); actual need, request timing and bypass behavior not fully checked. |
| AND-11 | BLOCKED (timezone slice) | Device GMT->LA changed local date to Oct17 while app retained Oct18 under documented Asia/Tokyo-fixed policy; restoring GMT preserved date/percentage. Normal reboot in follow-up; full system-clock changes/rollover limits remain untested. See ../android-dynamic/POST_RESUME.md. |
| AND-12 | BLOCKED (APK pattern scan complete) | All1344 APK ZIP entries scanned, including10DEX/29native libraries: no tested private-key/AWS/service-account/credential-assignment/JWT pattern match. Entropy111 hits remain nonsemantic opaque data. Full decompilation/release artifact not examined. See ../apk-followup/REPORT.md. |
| AND-13 | PASS (separate UID/private data paths) | Permissionless separately signed APK UID10235 versus Slope10234: DB canRead false, all4 provider queries and MonitorService/WebGuardService starts denied by SecurityException. See ../platform-app/REPORT.md and runtime-evidence.json. No root, all-method or release guarantee. |
| AND-14 | BLOCKED (resume slice) | Background/resume maintained child screen and completed queued upload. Rotation was requested but screen remained portrait (filename child-landscape is not landscape proof); settings restored. Repeated notification/task/rotation coverage remains. |

## Availability cases (5)

| ID | Status | Evidence and scope / remaining |
|---|---|---|
| AVL-01 | BLOCKED (QR failure limiter slice) | 10 invalid claims at 1 req/s returned 404 and 11th returned 429. Loop was repeated, 22 invalid claims total, exceeding the plan ceiling; auth/search/sync/issuance routes not covered. |
| AVL-02 | PASS | Same QR claim accepted once then conflict; one family link remained (`api/evidence.json`). |
| AVL-03 | PASS (single + multi-item recovery, duplicate idempotence, and permanent-error quarantine) | Single failed item persisted with network error/backoff and later uploaded 200 (`../android-dynamic/FOLLOWUP.md`). Multi-item device outbox test with 2 valid pending items and 1 forbidden item uploaded the 2 valid items (200, cleared from outbox), quarantined the forbidden item (`state: "quarantined"`, `attempts: 1`, not re-sent on subsequent flush), and cleared a re-queued duplicate `submissionId` with HTTP 200 (`../android-dynamic/multi-outbox-evidence.json`, `../android-dynamic/POST_RESUME_2.md`). |
| AVL-04 | FAIL (app PGlite health behavior) | Closing isolated app PGlite made `/api/health` and a regular API return generic 500 rather than planned 503. Recovery was not tested. Separate backend `/health` test did return 503 and recover 200; do not conflate the two servers. |
| AVL-05 | BLOCKED | No repeated navigation/background/memory/battery test. |

## IPA scenarios (15)

| ID | Status | Evidence and scope / remaining |
|---|---|---|
| IPA-01 | PASS (protected-route unauthenticated slice) | 34 protected API routes returned generic 401, no protected response. Does not cover all user-enumeration response comparisons. |
| IPA-02 | BLOCKED | Parent A cross-family config access and child ID substitution were rejected; selected wrong-child QR confirm returned 404. Not every read/write/aggregate endpoint was exercised. |
| IPA-03 | PASS (opaque session model) | Parent logout Back/cold restart gated protection; parent and child old credentials rejected401. Added idle-expired and unknown opaque bearer tests rejected401. JWT-signature case N/A for opaque server sessions; real provider OAuth callback remains IPA14. See ../api-followup/REPORT.md. |
| IPA-04 | BLOCKED (one SQL-like input passed) | SQL-looking display name remained literal; second distinct injection string and other DB input points were not exercised. |
| IPA-05 | BLOCKED (list/edit rendering passed) | Two markup-like synthetic names rendered literally in actual Android list and both edit fields; no alert/navigation observed. Exhaustive other display surfaces/notifications/WebView mapping not complete. See ../android-dynamic/FOLLOWUP.md. |
| IPA-06 | N/A (conditional) | No user-supplied file path/import-export endpoint identified for the server API. DEBUG manifest does include a non-exported Expo FileSystem provider; if app adds user-controlled file path/export flow, re-evaluate path boundary. |
| IPA-07 | N/A (conditional) | No application `child_process`/shell invocation or corresponding input field identified. Re-evaluate if one is added. |
| IPA-08 | N/A (conditional) | Current routes show no user-controlled redirect/response-header value path; no cookie/header construction use found. Re-evaluate if such endpoint or proxy path is added. |
| IPA-09 | N/A (conditional) | Current native client sends explicit `Authorization: Bearer`; no cookie-authenticated browser/WebView mutation endpoint identified. Re-evaluate if cookie auth is added. |
| IPA-10 | BLOCKED | One malicious-looking deep link left login; private service/provider and app DB probes were denied to shell. Not all 11 exported components or wrong URI/extra variants were tested. |
| IPA-11 | FAIL (known root dependency advisories) | Isolated lock-only npm audit reported 64 affected package entries (53 high, 11 moderate; 17 direct), including 4 unique upstream advisories in braces/esbuild/node-forge/uuid; backend audit reported 0. Hono 4.13.13 is outside three targeted Hono GHSA affected ranges. Android Gradle resolved dependency audit remains incomplete; see `npm-audit-summary.md`. |
| IPA-12 | FAIL (extreme future date case) | Extreme future usage request did not return before the local runner was stopped; exact duration is unavailable. Other small input boundaries and 8 MiB cap behaved as reported; no general DoS or load-resilience conclusion. |
| IPA-13 | FAIL (plaintext credential at rest) | Signed-in session token marker appears in app SQLite; child reporter token marker appears in SharedPreferences. App-private sandbox blocked shell UID, but values are not encrypted. |
| IPA-14 | BLOCKED | One unauthenticated deep link with forged role query stayed at login. Real OAuth host/callback validation, allowlisted host and full URI tests not performed. |
| IPA-15 | BLOCKED | Backup exclusion is static only; no backup/restore test, delete audit/confirmation review or cross-family destructive request observed. Unlink slice is not a backup/recovery test. |

## Current count (76 IDs)

- PASS: 28.
- FAIL: 7. Repeated IDs in different plan groups describe the same underlying findings but count separately.
- BLOCKED: 36.
- N/A (conditional): 5.

The explicit FAIL IDs across the 76 rows are PII-05, IN-04, AND-05, AVL-04, IPA-11, IPA-12, IPA-13 = **7 IDs**. All other unresolved IDs remain BLOCKED or conditional N/A.

### Classification of the remaining 36 BLOCKED items

1. **Policy / specification decision pending (6 IDs):** `PII-06`, `PII-10`, `IN-06`, `IN-10`, `AND-07`, `IPA-15` (Recents/QR `FLAG_SECURE` requirement, control characters in `packageName`, undecided date-boundary rules, and historical data retention/deletion policy upon family unlink).
2. **External prerequisite / environment or plan ceiling blocked (11 IDs):** `API-12`, `IN-05`, `IN-09`, `NET-01`, `NET-02`, `NET-03`, `NET-06`, `AND-01`, `AND-12`, `AVL-01`, `IPA-14` (requires production/release signing key + HTTPS endpoint + TLS proxy, real Google OAuth callback setup, or stopped at the plan's 20-request ceiling).
3. **Partial slice passed; full route/screen/endurance matrix remaining (19 IDs):** `PII-01`, `PII-02`, `PII-03`, `PII-04`, `PII-07`, `PII-08`, `IN-12`, `NET-08`, `AND-02`, `AND-06`, `AND-09`, `AND-10`, `AND-11`, `AND-14`, `AVL-05`, `IPA-02`, `IPA-04`, `IPA-05`, `IPA-10`.

## Evidence links

- API outcomes: [API REPORT](../api/REPORT.md), [primary HTTP evidence](../api/evidence.json), [supplemental evidence](../api/supplemental-evidence.json), [API unauthenticated route matrix](../android-dynamic/unauthenticated-matrix.json), [QR lifecycle evidence](../api-followup/qr-lifecycle-evidence.json).
- Android runtime: [platform probes](../android-dynamic/platform-probe.json), [parent/child storage summaries](../android-dynamic/parent-signed-in-storage.json), [post-logout storage](../android-dynamic/parent-logged-out-storage.json), [child storage/offline snapshots](../android-dynamic/child-before-outage.json), [child logged-out storage](../android-dynamic/child-logged-out-storage.json), [child stale-token result](../android-dynamic/child-token-after-logout.json), [child outage queued state](../android-dynamic/child-outage-queued.json), [multi-item outbox evidence](../android-dynamic/multi-outbox-evidence.json), [QR/outbox Logcat scan](../android-dynamic/logcat-qr-outbox-probe.json), [backend health sequence](../android-static/health/HEALTH_CHECK_RESULT.md), [merged debug manifest inventory](merged-debug-manifest-inventory.md).
- Dependency evidence: [npm audit summary](npm-audit-summary.md).
- Additional follow-up evidence: [device follow-up](../android-dynamic/FOLLOWUP.md), [API follow-up](../api-followup/REPORT.md), [minute boundaries](../api-followup/INPUT_MINUTES.md), [APK scan](../apk-followup/REPORT.md), [privacy inventory](../privacy-followup/REPORT.md), [post-resume device checks](../android-dynamic/POST_RESUME.md), [second post-resume checks](../android-dynamic/POST_RESUME_2.md), [separate-app checks](../platform-app/REPORT.md), [release manifest](../release-manifest/REPORT.md).
