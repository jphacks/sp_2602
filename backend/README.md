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

## Vercel and Neon

The backend has a dedicated Vercel project named `slope-backend`, linked locally from this directory with the Vercel CLI. The local `.vercel` project link and environment files are ignored by Git. The project is not connected to the GitHub repository and has not been deployed. `api/health.js` exposes the type-checked `GET /api/health` handler compiled from `src/vercel/health.ts`; `vercel.json` builds with npm and places API functions in `sin1`, close to the Neon database. The `public/404.html` file is only the required static output for unknown routes; there is no product UI. The local `npm run dev` server keeps `GET /health` for existing local workflows.

The Neon Marketplace resource `slope-backend-dev` is provisioned on the Free plan in `sin1` and its database variables, including `DATABASE_URL`, are available to the Vercel Development environment only. To use those credentials locally, run `vercel env pull .env --environment=development --yes` from this directory; `.env` is ignored by Git. The committed Drizzle migrations have been applied to Neon Development, and `npm run db:check` has verified a real connection. The integration command reported a variable-name collision for `NEON_PROJECT_ID`, but Vercel lists the Development variables and the connection check succeeds. Never commit `.env` or paste its values into logs. Vercel deployment has not been run.

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

`readChildConfigSnapshot` reads the config version, test periods, plan settings, excluded apps, and the latest calculation's daily limits in one read-only repeatable-read transaction. It returns the calculation's source config version and an explicit match flag; a missing version/calculation is represented as missing data, not a zero-minute limit. D3/D8/C9 writers increment `child_config_versions` in the same transaction as each relevant configuration change for that marker to remain meaningful. Authentication and parent-child authorization remain service/API responsibilities.

`replaceExcludedAppsForParent` checks the parent-child link in the transaction, replaces the active C9 app set, and increments the shared config version atomically only when the set changes. `savePlanSettingsForParent` applies the same linked-parent check and atomically saves D8 settings with a config-version increment; unchanged settings do not advance the version. Plan saving does not trigger C10 calculation. Both functions require the parent ID to come from an authenticated caller context. Future D3 write paths must also update the shared version in their transaction.

`createTestPeriod`, `listTestPeriods`, `updateTestPeriod`, and `deleteTestPeriod` provide D3 storage operations. They allow the child's own authenticated account or a parent with a stored family link; each mutation checks access and locks the child's shared config-version row in its transaction. Actual inserts/updates/deletes advance that version atomically, while unchanged updates and deletes of missing rows do not. Names must be nonblank and dates must be valid calendar dates with `endDate >= startDate`. The repository stores dates only; inclusive/exclusive end-date semantics are intentionally undecided. These operations do not invoke C10, and no HTTP/authentication API is included.

For C10, insert a `plan_calculation_versions` row and write its `daily_limits` in one transaction. The calculation-version foreign key prevents a daily limit from referencing a missing version. A failed transaction leaves the previously committed values in place; deciding which dates are final and which dates may be recalculated remains out of scope.

HTTP authentication and obtaining a trusted parent identity remain service/API responsibilities. The C9 repository enforces an existing parent-child link and updates the shared config revision; other configuration write paths must do the same. These policies are handled in application transactions rather than database triggers.

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
- Whether the test-period dates use inclusive end dates; the D3 repository stores start/end dates without defining calculation semantics.
