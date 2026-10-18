# API / IN / PII / AVL server-side test results (2026-10-18)

## Scope and setup

- Source snapshot: branch `security/android-security-test-plan`, HEAD `0ddfc7e` (provided by parent). No application, configuration, lockfile, or test source was changed.
- Dynamic checks called the real Hono route table over HTTP bound to loopback only: `127.0.0.1:4311` and `127.0.0.1:4312`. All accounts, sessions, family links, usage rows, and QR tickets were synthetic. `DATABASE_URL`, `LOCAL_DB_DIR`, and OAuth config were unset; `MOCK=1` was set; no `.env`/`.env.local`, external database, or OAuth endpoint was used.
- Historical execution deviation: the first runner's normal cases were sent as a quick sequential batch without the required 1 request/second spacing. The 11 QR-claim rate-limit probes themselves had 1 second between starts. The supplemental runner records and enforces a minimum 1 second between all HTTP request starts. The saved primary runner is now throttled globally; its oversized-body and 11-call QR-rate probes are disabled unless `RUN_SECURITY_OVERSIZE_PROBE=1` or `RUN_SECURITY_QR_RATE_PROBE=1` is set.
- Execution deviation: while revising/sanitizing the runner, the single >8 MiB body probe was repeated three times across isolated PGlite runs. Do not repeat it. The 11-request rate-limit sequence was also run twice (22 invalid QR claims total across isolated runs), exceeding the plan's 20-request ceiling; no further availability probes were made. The final evidence keeps only one sanitized run's 11 observations.
- Evidence files contain no raw Bearer tokens or QR codes. Test accounts/IDs are synthetic. Response timings are single samples unless otherwise stated.

## Dynamic case results

| Case | Result | Observation |
|---|---|---|
| API-01 | PASS | My real HTTP checks against signed-in, parent, child, and pairing routes each returned 401 with the same 144-byte generic error body. The parent-owned [`unauthenticated-matrix.json`](../android-dynamic/unauthenticated-matrix.json) additionally records 401 for all 34 protected routes, one request per route with 1.05-second spacing. |
| API-02 | BLOCKED (partial evidence) | Malformed Bearer returned generic 401 with no token/stack in the body. Expired/idle and revoked sessions were covered by isolated Vitest cases; a separate HTTP expired-session case was not run. |
| API-03 | PASS | Child calling parent-only save returned 403. Parent read before and after was byte-equivalent (config version and settings unchanged). |
| API-04 | PASS | Parent A reading Child B config returned 403. |
| API-05 | PASS | Parent A reading and writing Child B were denied; Child B's settings/version were unchanged before and after the write attempt. |
| API-06 | PASS | Child A usage upload with Child B's ID returned 403 before persistence. |
| API-07 / IN-07 | PASS | A parent save containing forged role/parent/owner/admin fields returned 200 for the allowed setting change; direct DB reads confirmed user roles and family links were unchanged. Unknown fields were ignored by the route schema. |
| API-08 | PASS (combined local evidence) | Initial app slice: health generic200, unknown404, protected API401. Subsequent isolated backend health sequence200 -> DB-stop503 -> restart200 and unknown404 is saved in ../android-static/health/HEALTH_CHECK_RESULT.md. No real env/database was used; this supersedes the earlier backend-not-started limitation. |
| API-09 | PASS | QR claim succeeded once, a second claim returned 409, confirmation linked the synthetic family, and an expired QR claim returned 409. |
| API-10 | PASS | A different synthetic child attempting to confirm another child's `pairId` got 404, without learning whether the pair exists. The API has no caller-supplied child-ID parameter on confirm. |
| API-11 | PASS (single side effect) | Repeating a successful `pairConfirm` returned 409 (`not yet claimed`); the family link count remained one. This meets the plan's no-duplicate-state-effect criterion. Lost-response/client retry UX was not tested. |
| API-12 | BLOCKED (body comparison passed) | Invalid-format and valid-but-unlinked child IDs both returned identical 403 JSON bodies (148 bytes). One timing sample each was 22.13 ms and 26.89 ms; this is not enough to infer timing resistance. |
| IN-01 | PASS | SQL quote text in a synthetic child display name was stored/read back as text; no query manipulation occurred. |
| IN-02 | BLOCKED (server text handling passed) | `<script>alert(1)</script>` was stored/read back as literal text. Android rendering behavior was not part of this server run. |
| IN-03 | PASS (name field boundaries) | In a supplemental real HTTP run, blank/whitespace returned 400; 120 characters, 60 emoji, and 60 combining sequences were accepted; 121 characters returned 400. The earlier 40/41 boundary was also observed. |
| IN-04 | FAIL (extreme-future request did not complete) | Impossible date, malformed date, and reversed dates returned 400; `0001-01-01` usage query returned 200 for that exact day. A real HTTP `POST /api/usage/get` for `from=to=9999-12-31` produced no observed response before the isolated runner was stopped. The script configures a 15-second abort signal, but no completion/timeout timestamp was preserved, so precise elapsed time is not established. This contradicts the plan's bounded 4xx expectation; no general DoS claim is made and the probe was not repeated. |
| IN-05 | BLOCKED (partial field coverage) | Zero usual-limit update returned 200. Decimal, huge integer, string, null, and array values for `startLimitMinutes` returned 400; negative `restrictedMinutes` returned 400. Earlier negative minutes and inconsistent goal also returned 400. Malformed per-app `usedMinutes` variants were not separately exercised. |
| IN-06 | BLOCKED (packageName probes; control accepted) | The API uses `packageName` rather than `appId`. Whitespace and 256-character values returned 400; a value containing a control character returned 200. Logs/UI were not exercised, so control-character handling is unresolved. |
| IN-07 | PASS | See API-07. Direct DB comparison found user roles and family links unchanged. |
| IN-08 | PASS | Same usage `submissionId` and payload returned `duplicate`; same ID with changed payload returned 409. |
| IN-09 | BLOCKED | Client cache ordering/version race needs Android/client execution; server request does not submit separate daily-limit/test-period versions. |
| IN-10 | BLOCKED (unit-only evidence) | Two existing local unit files, `tests/server/daily-limits.test.ts` and `tests/verify/c10-hand.test.ts`, passed 27 tests covering calculation boundaries. This does not cover every requested HTTP/config combination or settle rules marked undecided by the plan. |
| IN-11 | PASS with deviation | `MAX_BODY_BYTES` is 8 MiB. The preserved 8 MiB + 1 observation returned 400 `bad_request`. The worker reported three runs while repairing the runner, but only one run's sanitized response is retained; this report does not independently establish the other two responses. No further size probes. |
| IN-12 | BLOCKED | Normal request log capture/redaction was not performed. During AVL-04 DB-close injection, server stderr did emit an internal error stack/query diagnostic; the HTTP response itself was generic and contained no SQL/stack. No raw credential was found in saved evidence. |
| PII-01 | BLOCKED (family list slice passed) | Parent A and parent B each received only their own synthetic child in `family/get`; no cross-family row appeared. Full response comparison across all data APIs was not performed. |
| PII-02 | BLOCKED (cross-family config slice passed) | Cross-family config read/write and child ID substitution were denied. Usage/history/detail/aggregate variants were not all exercised. |
| PII-03 | BLOCKED (family/config response slices inspected) | Family listing and config response shapes were inspected; the full API response inventory and Android screens were not covered. |
| PII-04 | BLOCKED | Login/QR/usage happy-path log capture was not performed. The isolated DB-failure stderr behavior is described under IN-12. |
| PII-07 | BLOCKED (sampled responses generic) | Unauthorized, invalid input, forbidden, conflict, and database-closed responses used generic API error bodies without SQL/stack/environment values. Database-closed internal failures did log diagnostics server-side. |
| PII-08 | PASS (usage API slice) | Two synthetic children received identical usage timestamp, duration, app package, and display label patterns. Each parent read one matching record through its own child ID; response child IDs differed, with no cross-family row mixed in. Android screen rendering is outside this server result. |
| PII-09 | BLOCKED (one-use/expiry slices passed) | Use-once and expired QR paths rejected reuse. Logout/reissue invalidation and server log inspection were not covered. |
| PII-10 | PASS (unlink slice) | Parent unlink returned 200; child role reverted to null, child session was revoked, and parent family list became empty for the synthetic pair. Other delete/account-erasure/cache/queue paths were not present in this slice. |
| AVL-01 | BLOCKED (QR claim lockout slice passed; execution deviation) | At 1 request/second, 10 invalid QR claims returned 404 and the 11th returned 429. The probe loop ran twice during runner repair (22 calls total), exceeding the 20-call limit; no further rate probes were made. Other expensive routes were not measured. |
| AVL-02 | PASS (replay slice) | Same QR claim accepted once then returned 409; only one family link resulted. |
| AVL-03 | BLOCKED | Android retry queue/offline recovery is outside this server-only execution. |
| AVL-04 | FAIL (recovery untested) | Closing only the isolated in-memory PGlite DB made `/api/health` return 500 instead of the plan's expected 503; a regular authenticated API returned generic 500. Recovery was not tested because the runtime holds the closed DB object. No external DB was touched. |
| AVL-05 | BLOCKED | Android navigation/background behavior was not exercised. |

## Unit-level evidence (not HTTP evidence)

The following existing local Vitest files ran with `MOCK=1`, no `DATABASE_URL`, no `LOCAL_DB_DIR`, and no Google client ID. Result: **5 files passed, 54 tests passed** in 43.35 s.

- `tests/verify/security.test.ts`: role/child boundaries, pairing visibility/expiry and QR entropy, generic errors, version races, idempotent usage submission, and mass assignment on period/plan inputs.
- `tests/verify/google-token.test.ts`: audience/issuer/expiry/signature/unknown key/`alg:none` and generic error body cases.
- `tests/verify/mock-session-guard.test.ts`: demo/mock sessions rejected outside local MOCK mode and no automatic external DB seeding.
- `tests/verify/revoke-and-limit.test.ts`: session revocation, unlink revocation, and QR wrong-code rate limiting.
- `tests/server/body-limit.test.ts`: body over limit rejects with 400, oversized declared length rejects, and a maximal supported usage payload remains within the 8 MiB cap.

These tests use app/request and in-memory PGlite. They do not replace the real HTTP observations above.

Additional IN-10 calculation evidence: `tests/server/daily-limits.test.ts` and `tests/verify/c10-hand.test.ts` ran in a separate local Vitest invocation with the same isolated env (`MOCK=1`; no `DATABASE_URL`, `LOCAL_DB_DIR`, or Google client ID). Result: **2 files passed, 27 tests passed**. This is unit-level evidence only.

## Artifacts

- `evidence.json`: sanitized primary HTTP observations (4311).
- `../android-dynamic/unauthenticated-matrix.json`: parent-owned throttled no-auth matrix for all 34 protected routes.
- `supplemental-evidence.json`: throttled HTTP observations and measured response body sizes/timings (4312).
- `pii10-evidence.json`: focused isolated unlink and post-state evidence (4312).
- `boundary-progress.jsonl`: partial supplemental input probe records through the extreme-past date subcase; the `9999-12-31` call had no observed response before the isolated runner was stopped. Exact elapsed time was not preserved. No repeat was made.
- `input-remainder-evidence.json`: completion of the independent IN-05, IN-06, and same-pattern PII-08 probes with at least one second between HTTP request starts.
- `run-api-checks.mts`, `supplement.mts`, `pii10-check.mts`, `input-bounds.mts`, `input-remainder.mts`: synthetic runners. The saved primary runner's 8 MiB body test and 11-request QR loop are opt-in and must remain opt-in. The supplemental runner is throttled and has no oversized body test. `input-bounds.mts` stops after the extreme-future usage query and should not be rerun as-is.




Follow-up results from the same isolated source snapshot are separately saved in [API follow-up](../api-followup/REPORT.md) and [minute input boundaries](../api-followup/INPUT_MINUTES.md). The case matrix integrates these later observations.
