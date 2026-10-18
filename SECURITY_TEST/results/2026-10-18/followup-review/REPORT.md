# Independent follow-up evidence review

Date: 2026-10-18. Scope: read-only review of `SECURITY_FINDINGS.md`, `RESULTS.md`, `review/CASE_MATRIX.md`, `privacy-followup/REPORT.md`, and the available API/APK follow-up reports and evidence. No app files, other reports, ADB, network, tests, or builds were changed or run.

## Findings

1. **Unsupported elapsed duration in the build chronology.** `RESULTS.md` says the first `:app:assembleDebug` failed “18分10秒後” (after 18 minutes 10 seconds). The reviewed report set gives no linked command transcript or timestamps supporting that precise duration. Keep the observed Maven DNS failure, but omit the duration or cite its timestamp source. The extreme-future API case is correctly described elsewhere as having no response before runner stop with elapsed time unknown; `api/REPORT.md` says its configured abort is 15 seconds, and `api-independent-final-review.md` explicitly cautions against turning that into a measured 30-second server delay.

2. **Recovery status may be stale after the current follow-up.** `RESULTS.md` and `CASE_MATRIX.md` say the queued child outbox item remained and delivery/acknowledgement was not evidenced; on the inspected artifacts this is internally consistent and supports NET-05 / AVL-03 BLOCKED. The parent is performing a fresh recovery observation, so reconcile these two statements and the case statuses with that new evidence before treating this review snapshot as current. Do not infer delivery solely from health/config returning 200.

## Cross-checks that matched

- The 76-case totals reconcile: PASS 18 + FAIL 7 + BLOCKED 47 + conditional N/A 4 = 76. The 7 FAIL IDs match the explicit list. The findings summary's four underlying issues are also consistent with the repeated classifications: plaintext token storage (PII-05 / AND-05 / IPA-13), extreme future date (IN-04 / IPA-12), app API DB-health failure (AVL-04), and dependency audit warnings (IPA-11). Thus “7 failures” is a case-ID count, not seven distinct root causes.
- APK SHA-256 is consistently `30D32BF85B749086E4705DBFD6F22343043AA1429E5632FDAFB2A884F5EDDF3A` in `RESULTS.md`, `CASE_MATRIX.md`, and `apk-followup/REPORT.md`. The follow-up identifies the same archived debug APK and limits its secret scan to a heuristic pattern scan; it does not claim full reverse-engineering assurance or release behavior.
- The source basis consistently identifies archived `security/android-security-test-plan` commit `0ddfc7e`; the privacy and APK follow-ups explicitly scope themselves to `tmp/android-security-build`, not the edited current worktree.
- Checked all relative Markdown links in the five reviewed primary reports and the privacy follow-up; each target existed at review time. The new APK follow-up report's reproduction script path and evidence file are also present.
- Privacy follow-up appropriately leaves PII-03, QR/notification parts of PII-06, and AND-08 BLOCKED. It marks clipboard/share/export subpaths N/A only for the archived snapshot and does not promote source inventory into runtime PASS.
- The app-level health failure remains clearly separated from the separate backend health sequence. The audit summary keeps 64 affected package entries distinct from four upstream advisories, rather than describing 64 unique vulnerabilities.

## Scope note

This report records only concrete evidence mismatches or review-time caveats. In the initial review, no mismatch was found in counts, root-cause grouping, hashes, source commit identity, or relative links. The integration addendum supersedes the initial recovery-status caveat.

## Integration addendum (final bounded read-only check)

The parent integrated the latest dynamic follow-up. I re-read `SECURITY_FINDINGS.md`, `RESULTS.md`, `review/CASE_MATRIX.md`, and `android-dynamic/FOLLOWUP.md`; no runtime or test actions were taken.

- The case table has 76 rows and its statuses total **PASS 23 / FAIL 7 / BLOCKED 42 / conditional N/A 4**. Relative Markdown links in those four reports resolve at review time. API-02, API-04, IN-02, NET-05 (transport-fault method variation), and IPA-03 (opaque session model) are reflected in the five net promotions; the totals match.
- The recovery follow-up supports the limited NET-05 claim: it records pending 1 with network error/attempt 1 and backoff, then upload 200 at 04:08:17.523 UTC, outbox 0, and the stale warning cleared. The report explicitly says this was a local socket disconnect, not literal airplane mode or full-device network loss. AVL-03 remains BLOCKED for broader availability/recovery coverage.
- Camera evidence is limited to deny → rationale/re-request → one-time grant → scanner screen → cancel; no actual QR read is claimed. The two markup-like names appeared as text in the tested list and edit fields; IN-02 is scoped to those screens, while IPA-05 remains incomplete.
- IN-05 remains BLOCKED. The report records 14 additional requests and at least 21 cumulative, documents exceeding the 20-request ceiling, and says those requests stopped. This is not presented as exhaustive validation.

## Integration inconsistencies to reconcile

1. `CASE_MATRIX.md`'s environment bullet still says the queued item remained and instructs keeping **NET-05 / AVL-03 BLOCKED**. This conflicts with its updated NET-05 PASS row and the new `FOLLOWUP.md` evidence. Update the bullet to distinguish the earlier observation from the later single-record recovery; retain AVL-03 as BLOCKED.
2. `CASE_MATRIX.md`'s API-08 row still says `api/REPORT.md` labels it BLOCKED and asks to reconcile. The API report now labels API-08 PASS (combined local evidence), so remove that stale note.

No other overclaim or broken relative Markdown link was found in the four checked reports. The build duration claim flagged in the prior review has been removed from `RESULTS.md`.

