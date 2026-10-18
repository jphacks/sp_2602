# Backend `/health` endpoint check

- Date: 2026-10-18 (Asia/Tokyo)
- Scope: `backend/src/server.ts` GET `/health` and unknown route only. The API worker's port 4313 was not touched.
- Outcome: **PASS for this local backend endpoint sequence**. This is separate from the app `/api/health` route and does not cover DB/schema/API behavior beyond `SELECT 1`.

## Isolated setup

- PostgreSQL 17.11, new cluster only under `tmp/security-pg/cluster`, local trust authentication, bound to `127.0.0.1:5439`. Created only the test database `slope_security_test`; `SELECT 1` succeeded before testing.
- Backend ran from `tmp/android-security-build/backend/src/server.ts` on `127.0.0.1:4314`. In this isolated copy only, changed the listener from `0.0.0.0` to `127.0.0.1` and removed `import "dotenv/config"`; the isolated `node_modules` did not include `dotenv`. Set `DOTENV_CONFIG_PATH` to a nonexistent file as an additional guard. The actual health handler and SQL health check are unchanged.
- Backend process environment was cleared and set only to `DATABASE_URL` for this local test database, `PORT=4314`, the nonexistent `DOTENV_CONFIG_PATH`, empty `NODE_OPTIONS`, and TEMP/TMP under `tmp/security-pg/tsx-temp`. No repository `.env` file or production credential was read. No connection string or credential value is recorded here.
- No migrations or user data were loaded; the health check runs `SELECT 1`.

## Observed responses

| Stage | PostgreSQL 5439 | `GET /health` | `GET /unknown` |
|---|---|---|---|
| Healthy | Listening | `200` `{"status":"ok","database":"ok"}` | `404` `{"error":"not_found"}` |
| PostgreSQL stopped | Closed | `503` `{"status":"unavailable"}` | `404` `{"error":"not_found"}` |
| PostgreSQL restarted | Listening | `200` `{"status":"ok","database":"ok"}` | `404` `{"error":"not_found"}` |

The first health request during setup returned 503 because the newly initialized cluster did not yet contain the named test database. After creating that database and confirming `SELECT 1`, the healthy → stopped → recovered sequence above was rerun.

## Cleanup and limits

- Stopped only backend PID created for port 4314 and the cluster under `tmp/security-pg/cluster`. Final TCP probes showed ports 4314 and 5439 closed; that backend process was no longer present.
- The first sandbox `initdb` attempt failed with Windows restricted-token errors 87/3 and left partial files in the newly created `tmp/security-pg` root. A fresh child directory `cluster` was initialized successfully. No existing database directory or service was stopped or modified. Partial first-attempt files were left in place.
- No app API `/api/health`, emulator, APK, remote database, or production service was tested.
