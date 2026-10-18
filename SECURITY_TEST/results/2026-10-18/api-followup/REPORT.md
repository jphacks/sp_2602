# API security follow-up (2026-10-18)

## Scope and method

Executed the `0ddfc7e` isolated snapshot using the actual Hono routes over HTTP on `127.0.0.1:4315`. The database was a fresh in-memory PGlite instance with synthetic accounts and one synthetic usage row for Child B. `DATABASE_URL`, `LOCAL_DB_DIR`, and `VERCEL_ENV` were unset; no `.env` files, external services, port 4313, or app source files were used. Requests were spaced by at least 1.1 seconds, with one request per case.

## Results

| Case | Result | Evidence |
|---|---|---|
| API02: unknown synthetic Bearer value | PASS | `POST /api/config/get` returned generic 401 `unauthorized`; no synthetic usage marker was present in the response. |
| API02: session idle beyond 30-day limit | PASS | A synthetic demo session's `lastUsedAt` was moved to 30 days plus one minute in isolated PGlite. `POST /api/config/get` returned 401 `unauthorized`; no synthetic usage marker was present. |
| API04: Parent A reads Child B usage history | PASS | With a valid Parent A session and a seeded synthetic Child B usage row, `POST /api/usage/get` returned 403 `forbidden`; the response contained no Child B usage marker. |
| API04 control: Parent B reads own Child B usage history | PASS | `POST /api/usage/get` returned 200 and the expected synthetic usage marker was present. |

Each HTTP response completed in 22–124 ms, matching `evidence.json`. Evidence records response status, API error code, marker presence, and latency only. It contains no bearer values or raw response body.

## Interpretation and limits

The app stores opaque random session secrets and compares their database digests; these are not signed JWTs. A forged JWT signature is therefore not a meaningful API02 case for this implementation. The unknown synthetic Bearer probe checks that an unrecognized credential is rejected. Provider-issued OAuth token validation was outside this local API follow-up.

These results cover the isolated snapshot and the listed routes/cases only. They do not establish release APK or hosted-service behavior.

## Reproduction

`run-api-followup.mts` is the isolated runner. It clears database, deployment, and OAuth configuration before dynamically importing application modules, and exits if those values remain set. `evidence.json` contains the sanitized outcomes.
