# Backend database foundation

Node.js + TypeScript, PostgreSQL, and Drizzle ORM for the Slope MVP. This backend includes the persistence foundation, database-backed API paths, and C10 daily-limit calculation and persistence. Authentication provider verification and QR lifecycle policy remain deferred where the product rules are not decided.

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
| `users` | Internal user ID and nullable role until pairing is confirmed; no Google credential or token data |
| `auth_identities` | Provider subject to user mapping; no Google token is stored |
| `user_sessions` | Session ownership and lifecycle timestamps; only a token hash is stored |
| `family_links` | D2 parent-child edges; composite role foreign keys enforce direction, with no one-parent/one-child cardinality limit |
| `pair_tickets` | QR pairing state, participant references, and transition timestamps; only a code hash is stored |
| `child_config_versions` | C7 revision counter shared by settings, test periods, and excluded-app changes |
| `test_periods` | D3 named date ranges for a child |
| `plan_settings` | D8 plan start date, S, G, and usual limit in minutes |
| `plan_calculation_versions` | C10 calculation revision and source configuration revision |
| `daily_limits` | D6 value per child/date/calculation revision, preserving historical snapshots; zero is valid |
| `usage_sync_batches` | C8 client submission ID and optional payload fingerprint metadata |
| `usage_records` | D4 child, date, and app usage snapshot in minutes; only the newest measured snapshot per child and date is kept (D-127) |
| `excluded_apps` | D7 parent-managed excluded-app settings; system safety exceptions remain separate |

`usage_sync_batches.submission_id` is globally unique. `persistUsageSubmission` writes batch metadata and usage rows in one transaction. For each applied date it deletes the older day report and app rows of that child and date and inserts the new ones; dates that are not applied (older or equal `measuredAt`) are not stored. The batch row is always kept so that retries stay idempotent. A retry is acknowledged as a duplicate only when the child and the persisted date/app/minute rows match, independent of row order; reusing the ID for different content raises a conflict. The database stores an optional internal canonical payload fingerprint to compare retry payloads; this fingerprint is implemented as an internal idempotency detail. How the API aggregates multiple distinct cumulative snapshots into C6 totals remains undecided and is separate from retry fingerprinting.

`readChildConfigSnapshot` reads the config version, test periods, plan settings, excluded apps, and the latest calculation's daily limits in one read-only repeatable-read transaction. It returns the calculation's source config version and an explicit match flag; a missing version/calculation is represented as missing data, not a zero-minute limit. D3/D8/C9 writers increment `child_config_versions` in the same transaction as each relevant configuration change for that marker to remain meaningful. Authentication and parent-child authorization remain service/API responsibilities.

`replaceExcludedAppsForParent` checks the parent-child link in the transaction, replaces the active C9 app set, and increments the shared config version atomically only when the set changes. D8, usual-limit, D3, and blank-period writes check authorization and expected versions, update C10 input versions where relevant, and recalculate D6 plus its calculation revision in the same transaction. Invalid inputs or calculation failures roll back the whole write. Both C9 and plan repositories require the parent ID to come from authenticated caller context.

`createTestPeriod`, `listTestPeriods`, `updateTestPeriod`, and `deleteTestPeriod` provide D3 storage operations. They allow the child's own authenticated account or a parent with a stored family link; each mutation checks access and locks the child's shared config-version row in its transaction. Actual inserts/updates/deletes advance that version atomically, while unchanged updates and deletes of missing rows do not. Names must be nonblank and dates must be valid calendar dates with `endDate >= startDate`; C10 treats both endpoints as included. Invalid or conflicting input rolls back the D3 change and calculation update together.

`savePlanCalculation` locks the child's shared config-version row and stores a complete D6 snapshot with its source C10-input version in one transaction. D3/D8/blank-period persistence now calls the existing pure C10 engine before committing: it keeps today's finalized value, recalculates from tomorrow, and writes D6 plus the calculation version in the same transaction as the input change. Invalid C10 inputs roll back the whole change. The 120-day calculation horizon remains the existing development default and is still an open product decision.

HTTP authentication and obtaining a trusted parent identity remain service/API responsibilities. The C9 repository enforces an existing parent-child link and updates the shared config revision; other configuration write paths must do the same. These policies are handled in application transactions rather than database triggers.

The Expo/Hono API contracts and mock-backed handlers are present in the repository. C10 settings, test-period, and blank-period service paths use the PostgreSQL repositories when database mode is enabled. A passing local database test does not verify a deployed Vercel request or hosted Neon connectivity.

## Migrations and tests

- `npm run db:generate` generates a migration from `src/db/schema`.
- `npm run db:migrate` applies committed migrations to `DATABASE_URL`.
- `npm test` runs unit tests and skips PostgreSQL integration cases when `TEST_DATABASE_URL` is absent.
- `npm run test:db` requires `TEST_DATABASE_URL` to name a test database, applies migrations there, then checks connectivity, family cardinality, upload retry idempotency, and transaction rollback.

After `docker compose up -d postgres`, `.env.example`'s test URL can be used for `npm run test:db`. Do not point `TEST_DATABASE_URL` at a production or shared database.

## Deferred decisions

- Google ID token verification details (the identity mapping table is only storage; accepted provider/verification policy remains undecided).
- Session expiry and renewal policy; `user_sessions.expires_at` is nullable, and authentication handlers are not yet wired to this storage.
- QR expiry, reissue/invalidation, and consumption policy; `pair_tickets.expires_at` is nullable and the table stores state/timestamps without implementing transitions.
- Parent/child relationship cardinality and unlink/relink behavior. `family_links` only prevents duplicate copies of the same edge; neither endpoint is restricted to one relationship.
- C10 timezone, daily finalization time, same-day plan changes, and recalculation start point.
- How the API aggregates multiple distinct cumulative usage snapshots into C6 totals. Internal canonical fingerprinting for retry/idempotency is implemented and does not decide that API behavior.

## Migration 0008 preflight and legacy limit values

Before applying `0008_usage_records_app_unique.sql`, check for existing duplicate `(submission_id, usage_date, app_id)` rows. The migration adds a unique constraint and will fail if this query returns any rows:

```sql
SELECT submission_id, usage_date, app_id, count(*) AS row_count
FROM usage_records
GROUP BY submission_id, usage_date, app_id
HAVING count(*) > 1;
```

Review any results under an approved data correction policy before applying the migration. Do not automatically delete or rewrite records.

New `daily_limits` and `plan_settings` values are constrained to 0 through 1440. The C10 migration marks any existing out-of-range daily-limit snapshot as finalized before replacing the constraint, so recalculation can preserve that historical value in later versions without accepting an out-of-range mutable limit. It does not change the stored minute value. The `NOT VALID` constraints avoid scanning or rejecting unrelated legacy rows during migration.
