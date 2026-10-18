# Usage minutes input follow-up (2026-10-18)

## Scope and method

Exercised `POST /api/usage/upload` against isolated snapshot `0ddfc7e` over `127.0.0.1:4315`, using a fresh in-memory PGlite database and a synthetic child session. The runner clears database, deployment, and OAuth environment variables before loading application modules. It sent 14 requests total, with at least 1.05 seconds between request starts. Each request had a new synthetic submission UUID and used today's date.

For both `usedMinutes` (one app row) and `restrictedMinutes` (the day total), the cases were negative, zero, decimal, `MAX_SAFE_INTEGER`, string, null, and array. The saved evidence contains only status, API error code, database row counts, and case labels; it contains no credentials or raw request/response bodies.

## Results

- Zero was accepted for both fields (HTTP 200). `usedMinutes: 0` created a batch, day report, and app row. `restrictedMinutes: 0` created a batch and replaced the same child's same-date snapshot, so report and app row counts stayed steady.
- The other six values for each field were rejected with HTTP 400 `bad_request`.
- All 12 rejected requests left usage batch, day report, and app record counts unchanged.

This verifies the enumerated values and persistence boundary on the isolated snapshot only; it does not establish hosted or release behavior.

## Reproduction

Run `node --import tsx SECURITY_TEST/results/2026-10-18/api-followup/input-minutes.mts`. Sanitized per-case results are in `input-minutes.evidence.json`.
