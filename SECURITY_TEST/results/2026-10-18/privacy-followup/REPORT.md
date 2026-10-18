# Privacy follow-up: response DTOs and user-facing egress

**Date:** 2026-10-18  
**Source basis:** archived application snapshot `0ddfc7e` at `tmp/android-security-build` (the current worktree has unrelated app edits; this note makes no claim about them). This is a source inventory only. No build, test, ADB, network, or database action was performed.

## Case disposition

| Case | Applicability / source finding | Status |
|---|---|---|
| PII-03 | Applicable. DTOs contain expected identity, authorization, configuration, pairing, and detailed app-use fields. The schemas and representative UI consumers were mapped below, but this was not an exhaustive response-by-response JSON/UI comparison. | BLOCKED; source-only inventory, no runtime response/UI confirmation. |
| PII-06 | Applicable. QR ticket is rendered in the child pairing screen; notifications are built natively. Source search found no application clipboard, share Intent, or user-facing file export implementation. | BLOCKED; QR lifecycle screenshots/recents and notification lock-screen exposure were not dynamically checked. |
| AND-08 | Applicable due to QR display and native notification paths. Clipboard/share/file-export subpaths: N/A in this snapshot (no implementation found). | BLOCKED overall; no OS UI/data-transfer inspection. |

## PII-03 DTO and display inventory

The API contract uses response schemas per route (`contracts/api.ts:75-`); representative fields that are user-relevant or potentially identifying:

- `Session` requires `token`, `userId`, `name`, and nullable `role` (`contracts/schemas.ts:56-64`). The schema comment says `name` is displayed; the token is used as the Bearer credential. These are necessary session data, but the full response must be checked to ensure the UI/logging does not expose the token.
- Pairing ticket returns `pairId`, one-time `code`, and `expiresAt` (`schemas.ts:95-101`). Pair status returns `pairId`, state, child `{id,name}`, optional `parentName`, and expiry (`108-115`). Pair screen renders the ticket code as QR and a remaining-time label (`src/app/pair/child.tsx:257-258`); confirmation title uses the parent name (`:266`). Code is a short-lived pairing secret even though the schema comments say it excludes personal data.
- Family/link responses expose linked counterpart `userId`, `name`, and `role`, and family child `id` and `name` (`schemas.ts:127-146`). `Child.name` is documented for display (`:76-81`). IDs appear necessary for authorized child-scoped API calls; whether all are visibly rendered was not exhaustively checked.
- `ParentUsageView` returns `childId`, requested date range, each day's recorded state, total minutes, measurement timestamp, limit, per-app `{packageName,label,usedMinutes,excluded}`, plus last upload time (`schemas.ts:651-668, 733-751`). Per-app label and minute detail are explicitly consumed by the parent app-use screen (`src/app/parent/app-usage.tsx:2,87,177`); parent home exposes today's total and weekly chart (`home.tsx:166-174,211`); review shows weekly averages (`review.tsx:2-3,205`). This is sensitive usage history by design, not an accidental extra column, but requires authenticated screen/recents handling.
- Other DTOs include `childId`, config/version counters, schedules, app package names, website patterns, and device permission states (e.g. `PlanView` `schemas.ts:199-208`; `ConfigSnapshot` `602-618`; `ChildAppsView` `540-548`; `DeviceStatusView` `580-597`). These can reveal routines/apps or device posture. This pass did not enumerate every response schema or correlate every field with UI use; PII-03 stays blocked.

## Clipboard, share, export, QR, and notification paths

- Search of archived `src`, `modules`, and package manifest for Clipboard APIs, `Share.share` / `shareAsync`, `expo-sharing`, file export calls, or app notification scheduling found no clipboard, share, or user-facing export flow. Mark those specific subpaths N/A for this snapshot, and re-evaluate if a new action is added.
- Pair QR is an actual egress path: `src/app/pair/child.tsx:257` passes the ticket code into `QrCard`; `src/components/pair/QrCard.tsx:6,15` and `src/kids/components/pair/QrCard.tsx:11,28` render it with `react-native-qrcode-svg`. The ticket code should be treated as a reusable-until-consumed secret; source says 10-minute expiry/one-use (`contracts/schemas.ts:95-100`). Source checks do not prove screenshots, recent-app thumbnails, or stale QR rejection after cancel/reissue; parent API evidence addresses one-use/replay separately, not image reuse.
- Native notifications are actual system surfaces. `MonitorService.kt:218-226,251-265` emits a foreground notification containing monitoring state and a usage percentage (not raw minutes or app names per `statusText` comment and implementation). `LimitPrompt.kt:51-77` emits a time-limit message. `StatusReporter.kt:191-203` emits an accessibility-permission restoration message and says the parent was notified. None of these strings contains a token, QR code, app name, or exact app-use history in source; lock-screen redaction/preview behavior remains device- and OS-dependent and unverified.
- Native notification permission is observed by app permission state (`EnginePermissions.kt:19,29-57`), but that is not evidence of privacy settings for lock-screen previews.

## Safe next UI checks

1. On the isolated test device, display the pairing QR, capture the app in Recents, then leave/cancel/reissue and attempt the old code; verify no token or family identifiers are encoded or exposed in a screenshot/preview and the server rejects stale/reused codes.
2. Trigger each of the three native notification classes with synthetic data. Inspect lock-screen and expanded notification text under default and hidden-sensitive-content settings; confirm only the intended percentage/status and generic guidance are shown.
3. Walk representative parent usage, family, app-list, and pairing screens while capturing accessibility tree and screenshots; compare every received JSON field with fields actually rendered or required for navigation. Repeat after logout and account switch.
4. Record clipboard/share/file-export as N/A unless a new UI affordance is found; if found, inspect payload and receiver behavior before marking AND-08 complete.

**Conclusion:** this reduces static-source uncertainty for PII-03 / PII-06 / AND-08, but does not establish PASS. PII-03 and the QR/notification portions of PII-06 and AND-08 need dynamic UI evidence.
