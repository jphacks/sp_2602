# Sanitized npm audit summary

Access date: 2026-10-18 (Asia/Tokyo)

The original root and backend `package.json` / `package-lock.json` were copied into separate review-only directories. `npm audit --package-lock-only --ignore-scripts --json` ran in each copy; no dependency installation or package scripts were run. Original lockfiles remained unchanged (`git diff` empty). The command sent the public package/version dependency graph to the configured npm registry.

| Scope | Exit | npm audit result | Interpretation |
|---|---:|---:|---|
| Root app | 1 | 64 affected package entries: 53 high, 11 moderate, 0 low, 0 critical | Findings present; review and triage before treating dependencies as clean. 17 entries were marked direct, 47 transitive. `fixAvailable=false` for all reported entries in this lock. |
| Backend | 0 | 0 affected package entries | No advisory matched the backend lock in this run; this is registry snapshot output, not a claim that software is secure. |

Unique advisory records in the root audit payload (4):

| Package locked | Exact locked version | Advisory | Severity and affected range |
|---|---:|---|---|
| `braces` | 3.0.3 | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | High; `<=3.0.3` |
| `esbuild` (nested under `@esbuild-kit/core-utils`) | 0.18.20 | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | Moderate; `<=0.24.2`. Root-level `esbuild` 0.28.2 and `drizzle-kit` nested 0.25.12 are outside this record's affected range. |
| `node-forge` | 1.4.0 | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | High; `<=1.4.0` |
| `uuid` | 7.0.3 | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Moderate; `<11.1.1` |

The npm JSON also marks dependent package paths affected through these vulnerable nodes; severity totals count affected package entries, not just unique advisory records. This summary intentionally omits transitive package trees and raw URLs/fields not needed for triage. Full JSON remains in the review-only audit directories if the parent needs detail; no secrets appeared in the saved response files.

Hono 4.13.13 itself was not present in the root audit `vulnerabilities` map. That observation is limited to this npm audit snapshot and is not proof of security.
