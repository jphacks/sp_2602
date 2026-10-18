# Independent final review: API server-side report

- Reviewed: `SECURITY_TEST/results/2026-10-18/api/REPORT.md` and its JSON/JSONL evidence plus `android-dynamic/unauthenticated-matrix.json`.
- Review scope: read-only; no requests, DB, project/test script execution, or source modification.

## Assessment

No unsupported PASS was found in the high-priority adjudications:

- **API-11 PASS (single side effect)** is supported by the recorded successful confirm (`API-09d`), retry response 409 (`API-11`), and `familyLinksForQrChild: 1`. The plan criterion is absence of duplicate link state, so different replay response semantics do not invalidate that limited PASS. The report correctly excludes lost-response/client retry UX.
- **API-01** is supported by the separate `android-dynamic/unauthenticated-matrix.json`: it contains 34 protected API routes, each recorded 401, generic `unauthorized`, 144 bytes, with request starts spaced about one second. The API report's own evidence only shows the four category samples; the matrix is the comprehensive evidence.
- **IN-04 FAIL** is the appropriate bounded-case result: the plan explicitly expects rejection of extreme past/future dates; the extreme-future query did not yield a response within the observed wait and the isolated runner was stopped. The report carefully limits this to that input and does not call it a general DoS finding. Invalid-format, reversed, and extreme-past controls are recorded as 400/400/200. The future timeout itself has no JSONL completion event because the request did not complete; the report is the saved operator observation.
- Other reported PASS slices generally have matching response/state observations. PII-10 and similar scoped labels expressly limit conclusions to the exercised unlink slice.

## Evidence-quality notes for parent

1. `REPORT.md` should cross-reference `../android-dynamic/unauthenticated-matrix.json` under Artifacts and state “34 protected routes” in API-01. Without that link the report under-describes the stronger matrix and readers may only see four route classes.
2. IN-11 currently says “Each 8 MiB + 1 request returned 400”; the retained `evidence.json` records one such response. The report transparently states the probe was repeated three times, but individual outcomes for all repetitions are not retained in the listed evidence. For strict evidence traceability, phrase the observable claim as “the retained probe returned 400” and state that three attempts were reported but only one sanitized response is retained.
3. `input-bounds.mts` declares `AbortSignal.timeout(15000)`, while the report describes waiting “about 30 seconds.” This can describe the runner/process not returning even after request timeout, but the artifact does not contain a start/end timestamp for the extreme-future call. Preserve the bounded FAIL while distinguishing “no HTTP response; runner stopped” from a precisely measured server response time unless another log supports the 30-second duration.

## Final outcome

The report's BLOCKED/FAIL distinctions are careful and materially accurate. I found no concrete unsupported PASS in API-11 or the other reviewed slices. The three notes above are traceability/wording improvements, not requests to rerun probes.
