# Backend database foundation

Node.js + TypeScript, PostgreSQL, and Drizzle ORM for the Slope MVP. The current scope is the persistence foundation and a database-backed `/health` check; authentication, QR APIs, and the C10 calculation engine are not implemented.

## Local setup

1. Start a local PostgreSQL instance using your existing PostgreSQL installation/service.
2. Create `slope_dev` and `slope_test` databases (for example, `createdb slope_dev` and `createdb slope_test`).
3. Copy `.env.example` to `.env` and set both URLs to match the credentials of that local PostgreSQL instance. The sample `slope` credentials are only for the optional Compose environment.
4. Install packages with `npm install`.
5. Apply migrations with `npm run db:migrate`.
6. Check the connection with `npm run db:check`.
7. Start the health-only server with `npm run dev`; `GET /health` returns 200 only while PostgreSQL is reachable.

Docker is not required. For contributors who prefer an isolated local instance, `docker compose up -d postgres` is an optional shortcut that binds PostgreSQL to localhost and initializes both databases. The initialization script runs only when the Compose volume is first created. If it changes afterward, the existing databases can be created manually; `docker compose down -v` would remove the local database contents.

## Schema overview

| Table | Purpose |
| --- | --- |
| `users` | Internal user ID and parent/child role; no Google credential or token data |
| `family_links` | D2 parent-child edges; composite role foreign keys enforce direction, with no one-parent/one-child cardinality limit |
| `child_config_versions` | C7 revision counter shared by settings, test periods, and excluded-app changes |
| `test_periods` | D3 named date ranges for a child |
| `plan_settings` | D8 plan start date, S, G, and usual limit in minutes |
| `plan_calculation_versions` | C10 calculation revision and source configuration revision |
| `daily_limits` | D6 one current value per child/date, with its calculation revision; zero is valid |
| `usage_sync_batches` | C8 client submission ID and optional payload fingerprint metadata |
| `usage_records` | D4 per-submission, child, date, and app usage snapshot in minutes |
| `excluded_apps` | D7 parent-managed excluded-app settings; system safety exceptions remain separate |

`usage_sync_batches.submission_id` is globally unique. `persistUsageSubmission` writes batch metadata and usage rows in one transaction. A retry is acknowledged as a duplicate only when the child and the persisted date/app/minute rows match, independent of row order; reusing the ID for different content raises a conflict. Payload fingerprint metadata is optional because its canonicalization is not yet decided. Aggregation across distinct snapshots is intentionally left to the C8/C6 API design.

`readChildConfigSnapshot` reads the config version, test periods, plan settings, excluded apps, and the latest calculation's daily limits in one read-only repeatable-read transaction. It returns the calculation's source config version and an explicit match flag; a missing version/calculation is represented as missing data, not a zero-minute limit. Writers must increment `child_config_versions` in the same transaction as each relevant configuration change for that marker to remain meaningful. Authentication and parent-child authorization remain service/API responsibilities.

For C10, insert a `plan_calculation_versions` row and write its `daily_limits` in one transaction. The calculation-version foreign key prevents a daily limit from referencing a missing version. A failed transaction leaves the previously committed values in place; deciding which dates are final and which dates may be recalculated remains out of scope.

Endpoint authorization, config revision increments, and cross-table write orchestration are application responsibilities; this foundation does not claim to enforce those policies through triggers.

## Migrations and tests

- `npm run db:generate` generates a migration from `src/db/schema`.
- `npm run db:migrate` applies committed migrations to `DATABASE_URL`.
- `npm test` runs unit tests and skips PostgreSQL integration cases when `TEST_DATABASE_URL` is absent.
- `npm run test:db` requires `TEST_DATABASE_URL` to name a test database, applies migrations there, then checks connectivity, family cardinality, upload retry idempotency, and transaction rollback.

After `docker compose up -d postgres`, `.env.example`'s test URL can be used for `npm run test:db`. Do not point `TEST_DATABASE_URL` at a production or shared database.

## Deferred decisions

- Google identity verification and external authentication subject mapping.
- QR token storage boundary, expiry, reissue, and consumption policy.
- Parent/child relationship cardinality and unlink/relink behavior.
- C10 timezone, daily finalization time, same-day plan changes, and recalculation start point.
- C8 canonical payload hashing and how multiple cumulative usage snapshots are aggregated.
- Whether the test-period dates use inclusive end dates, beyond the current date-range storage.
