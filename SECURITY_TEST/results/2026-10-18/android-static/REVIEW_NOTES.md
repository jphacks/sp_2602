# API worker review notes

Review snapshot: 2026-10-18, read-only review of `api/run-api-checks.ts` and `api/evidence.json`. No DB test or API script was run here. These artifacts contain observed HTTP responses; they do not currently contain PASS verdicts.

## Trust boundary and test isolation

- The script exercises the actual Hono app (`src/server/app.ts`) and handler/auth path over loopback `127.0.0.1:4311`, not an isolated mock route. `src/server/route.ts` calls `authorize` before parsing input/business logic, and `src/server/auth.ts` validates hashed, stored sessions and role/family scope.
- It inserts test users, sessions, and two family links directly into the DB; credentials are random synthetic tokens with only `digest(token)` stored. Additional QR/input identities and IDs are synthetic. `MOCK=1` is set, but these users have provider `security-test`; their authorization still traverses the normal session lookup. No Google/OAuth authGoogle login flow is exercised.
- Before the first `db()` call, the script clears `DATABASE_URL`, `LOCAL_DB_DIR`, and `VERCEL_ENV`. With no configured directory, `src/server/db/index.ts` uses in-memory PGlite. The HTTP server binds only to loopback. The recorded evidence redacts token and QR-code fields; the remaining names, dates, and UUID-shaped IDs appear synthetic.

## Classification cautions

- **API-03:** 403 proves role rejection. The plan also requires unchanged settings; this evidence does not read back state. Mark partial unless the handler's pre-business authorization evidence is explicitly accepted as sufficient.
- **API-04 / API-05:** Same request and same `/api/config/get` read are executed twice. This supports one cross-family settings read denial, not separate read/write coverage or usage-history denial.
- **API-02:** Only malformed token is exercised; expired and signature-invalid variants are not covered.
- **API-07 / IN-07:** The requests include spoofed `role`/owner fields, but the caller is a valid authorized parent and the 200 response only shows the ordinary limit update. No persisted owner/role/config state is inspected afterward. A 200 is not itself proof the spoofed fields were ignored; mark partial pending state comparison. `route.ts` does authorize from the bearer session before input parsing, and the route schema controls accepted fields.
- **API-08:** Script hits app route `/api/health`, `/not-a-route`, and unauthenticated `/api/auth/me`. It does not hit the separately documented `backend/src/server.ts` `GET /health`; mark API-08 partial. The route health body `{ok:true,mock:true}` is visible in evidence and contains no apparent secret.
- **API-09:** Real app route behavior covers valid claim, a second claim rejected with conflict, wrong child confirmation rejected with 404, correct confirmation linked, and an expired synthetic ticket rejected. This is useful route-level evidence.
- **API-11:** A repeated child confirm after linking returns 409 (`auth.ts` rejects any state other than `claimed`), rather than repeating the prior `linked` success. The direct DB count shows one family link. This proves no duplicate link side effect in this run, but not response-level idempotency; mark partial or fail if the plan requires replay to return the same result.
- **API-12:** Invalid UUID and valid-but-unlinked ID produce the same observed 403 JSON body. Timing/response-size comparison is not recorded, so only body equality is supported.
- **IN-01:** SQL-looking name is returned as the same literal by the status route; no injected behavior is observed in this case.
- **IN-02:** XSS-like string is returned in JSON. There is no Android/UI rendering check here; do not call the overall XSS case PASS.
- **IN-03:** Only 40-character acceptance and 41-character rejection are covered, not blank, whitespace, emoji, or combining characters.
- **IN-04:** Only one nonexistent date is rejected; ordering, formats, extremes, and timezone behavior remain untested.
- **IN-05:** The sample uses negative plan input fields, not the full `usedMinutes`/`limitMinutes` type/range matrix. Partial coverage only.
- **IN-11:** A body greater than the configured 8 MiB app limit is rejected. The plan's 64 KiB example is not tested; report the actual tested threshold and response rather than claiming general size-boundary coverage.
- **AVL-01:** Eleven invalid QR claims at one-second intervals produce 429 on attempt 11, supporting the QR-claim failure limiter. The extra `AVL-01` entry is just authenticated `/api/auth/me` (200); this is not a rate-limit result. No broad rate-limit coverage of auth, search, sync, or QR issuance.

The evidence is strong for the specific observed statuses and useful for route-level auth/QR/input checks. Case-level PASS should be withheld where required side-effect comparisons, other routes, timing, UI rendering, or inputs are absent.
