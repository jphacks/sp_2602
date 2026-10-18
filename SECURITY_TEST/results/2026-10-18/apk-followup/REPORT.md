# APK follow-up: AND-12 and release/debug source review

Date: 2026-10-18
Scope: read-only inspection of the assigned debug APK and the isolated `tmp/android-security-build` source snapshot. No build, test, device command, network access, source edit, or user-worktree modification was performed. Results are limited to `SECURITY_TEST/results/2026-10-18/apk-followup/`.

## Artifact identity

- APK: `tmp/android-security-build/android/app/build/outputs/apk/debug/app-debug.apk`
- SHA-256: `30D32BF85B749086E4705DBFD6F22343043AA1429E5632FDAFB2A884F5EDDF3A` (matches assigned hash)
- ZIP entries scanned: 1,344, including 10 DEX entries, 29 native `.so` entries, resources, XML, assets, and packaged text/configuration.

## AND-12: embedded secret scan

Automated byte scan covered every decompressed ZIP entry, including DEX, assets, and native libraries. Reported counts only; candidate values were never emitted.

| Pattern | Hits | Entries | Result |
|---|---:|---:|---|
| Private-key PEM marker | 0 | 0 | No match |
| AWS access-key ID shape | 0 | 0 | No match |
| Google service-account JSON marker | 0 | 0 | No match |
| Credential assignment with long literal | 0 | 0 | No match |
| JWT-like three-part string | 0 | 0 | No match |
| Long high-entropy ASCII heuristic (>=5.2 bits/char, >=40 chars) | 111 | 15 | Heuristic flags in DEX/native library payloads; not classified as credentials |

Packaged app assets include `assets/app.config` and `assets/app.fingerprint`; the app config contains package/build metadata and no populated Google web client ID or API URL. The generated debug BuildConfig contains only standard build flags, app/package ID, version, and the React Native release-level field; no credentials. No credential-like scan matches were found in this static review.

Limitations: this is a reproducible pattern scan, not a semantic decompilation or full reverse-engineering review. It can miss encrypted/obfuscated, split, or nonstandardly encoded secrets. The entropy heuristic is intentionally noisy and flags opaque program/library data. This does not prove absence of every possible secret. Public IDs and URLs were not classified as secrets by themselves.

## AND-01 / release versus debug: source-only

- The inspected artifact is `debug`, with generated `BuildConfig.DEBUG=true`; the archived manifest inventory also records `debuggable=true` and cleartext enabled.
- Cleartext is explicitly enabled in `android/app/src/debug/AndroidManifest.xml` (and source search identifies a `debugOptimized` override). Main manifest has no cleartext override. This supports that the observed exception is attached to debug source sets, but only a merged release manifest/APK can establish the packaged release result.
- Release config selects `signingConfigs.release`, not the default debug key. For local release builds, the `preReleaseBuild` dependency checks all four `SLOPE_UPLOAD_*` values and stops when absent/incomplete; EAS builds skip that check because EAS is expected to populate release credentials. No signing credentials or values were inspected or printed.
- `android.enableMinifyInReleaseBuilds=true` is present in the snapshot's `android/gradle.properties`.
- No release APK or release merged manifest is present in the inspected build outputs. Release debuggability, cleartext policy after manifest merging, packaged BuildConfig/resources, and actual signing certificate remain unverified.

## Disposition

- AND-12: **BLOCKED (static pattern scan completed; full decompile/secret assurance not established)**. No credential-pattern hit observed.
- AND-01 release comparison: **BLOCKED**. Source config suggests distinct debug/release handling, but no release artifact evidence exists. Existing debug-only component inventory does not establish release component reachability.

## Reproduction

`python SECURITY_TEST/results/2026-10-18/apk-followup/scan_apk.py tmp/android-security-build/android/app/build/outputs/apk/debug/app-debug.apk`

The script reports hashes, entry/type counts, pattern counts, and entry paths only; it does not print matched credential strings.
