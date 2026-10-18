# Merged DEBUG manifest inventory (static)

- Source: generated isolated project `tmp/android-security-build/android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml`.
- Variant: DEBUG, `debuggable=true`, package `com.quedotcom.androidslope`, min SDK 24, target SDK 36.
- Captured: 2026-10-18. Exact generated manifest is included beside this inventory. Static contents inspected; no credential/token/key material present, so no redaction was needed.
- This is not the release manifest or an installed APK result. Release build/manifest remains pending.

## Application defaults / data / network

- `android:allowBackup="false"`; `android:dataExtractionRules="@xml/slope_data_extraction_rules"`.
- Extraction rules exclude all listed root, file, database, sharedpref, external, device_root, device_file, device_database and device_sharedpref domains for cloud backup and device transfer.
- `android:debuggable="true"` is expected for this debug variant.
- `android:usesCleartextTraffic="true"`; no `android:networkSecurityConfig` attribute is present. This merged DEBUG build therefore permits cleartext traffic beyond just loopback. Main manifest has no such attribute; source has this override under `src/debug` (and `src/debugOptimized`). Treat as a DEBUG-only override pending merged RELEASE manifest verification. Don't use it as release NET-01 evidence.
- `android:exported=true` main Slope activity, `singleTask`, supports MAIN/LAUNCHER and browsable DEFAULT VIEW for `slope:` and `exp+slope:`.

## Exported components and Android permission gates

| Type / component | Exported | Gate / intent surface | Review note |
|---|---:|---|---|
| Activity `com.quedotcom.androidslope.MainActivity` | yes | MAIN/LAUNCHER; BROWSABLE DEFAULT VIEW, schemes `slope`, `exp+slope` | Product entry/deep link. Test invalid scheme/host/path and unauthenticated pair/config access. |
| Activity `expo.modules.devlauncher.launcher.DevLauncherActivity` | yes | No filter or explicit permission | Expo dev-client component present in DEBUG merged manifest. Determine release inclusion from release merged manifest; don't assume debug tooling absent in production. |
| Activity `expo.modules.devlauncher.compose.AuthActivity` | yes | BROWSABLE DEFAULT VIEW `expo-dev-launcher:`; no component permission | Dev-launcher auth callback surface; likely dev-client-only. Confirm release variant and fuzz malformed URI/empty extras only on local AVD. |
| Activity `androidx.compose.ui.tooling.PreviewActivity` | yes | No filter or explicit permission | Tooling activity in DEBUG merged manifest. Confirm whether release includes it. |
| Receiver `dev.hackathon.kit.kitnative.widget.SlopeWidget` | yes | APPWIDGET_UPDATE and app action `dev.hackathon.kit.kitnative.TODAY_UPDATED`; no permission | External action may be spoofed while exported; test only synthetic harmless redraw/input and check it cannot read/write another component's data. |
| Receiver `dev.hackathon.kit.kitnative.admin.SlopeDeviceAdminReceiver` | yes | `android.permission.BIND_DEVICE_ADMIN` | OS/device-admin protected. |
| Receiver `dev.hackathon.kit.kitnative.admin.DeviceOwnerBootReceiver` | yes | BOOT_COMPLETED and MY_PACKAGE_REPLACED; no explicit permission | Intended system broadcasts. Test only local harmless spoof if runner allows; ensure no destructive operation on receipt. |
| Receiver `dev.hackathon.kit.kitnative.admin.DeviceOwnerReleaseReceiver` | yes | `android.permission.DUMP` | Explicit permission gate; verify external app cannot dispatch, while not issuing the actual owner-release action. |
| Receiver `dev.hackathon.kit.kitnative.engine.BootReceiver` | yes | BOOT_COMPLETED and MY_PACKAGE_REPLACED; no explicit permission | Intended system broadcasts. Test only non-destructive start/restart behavior. |
| Service `com.google.android.gms.auth.api.signin.RevocationBoundService` | yes | `com.google.android.gms.auth.api.signin.permission.REVOCATION_NOTIFICATION` | Third-party Google Sign-In component. Permission's protection level isn't described in this manifest; verify Android package permission owner/level from installed package if deeper gate validation is needed. |
| Receiver `androidx.profileinstaller.ProfileInstallReceiver` | yes | `android.permission.DUMP`; profileinstaller actions | OS-level permission gate. Do not invoke benchmark actions. |

No exported ContentProvider appears. Provider inventory (all `exported=false`):

- `expo.modules.filesystem.FileSystemFileProvider`, authority `com.quedotcom.androidslope.FileSystemFileProvider`, `grantUriPermissions=true` (inspect granted-URI behavior only if a sharing/export path is exercised).
- `com.google.mlkit.common.internal.MlKitInitProvider`, authority `com.quedotcom.androidslope.mlkitinitprovider`.
- `org.jetbrains.compose.resources.AndroidContextProvider`, authority `com.quedotcom.androidslope.resources.AndroidContextProvider`.
- `androidx.startup.InitializationProvider`, authority `com.quedotcom.androidslope.androidx-startup`.

Other service/receiver declarations in this manifest have `exported=false`, including app MonitorService, accessibility WebGuardService, StatusReportReceiver, CameraX/MlKit support and Room invalidation service. The `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` custom permission is `protectionLevel=signature`.

## Declared permissions and query visibility

Permissions: CAMERA, INTERNET, READ_EXTERNAL_STORAGE and WRITE_EXTERNAL_STORAGE capped at API 32, SYSTEM_ALERT_WINDOW, VIBRATE, CHANGE_WIFI_MULTICAST_STATE, ACCESS_NETWORK_STATE, ACCESS_LOCAL_NETWORK, RECEIVE_BOOT_COMPLETED, PACKAGE_USAGE_STATS, QUERY_ALL_PACKAGES, FOREGROUND_SERVICE, FOREGROUND_SERVICE_SPECIAL_USE, POST_NOTIFICATIONS, USE_FULL_SCREEN_INTENT, REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, and the generated signature permission above. Runtime/special-access permissions need device-level review; declaration is not proof that they are granted or required in production.

Package visibility queries include `host.exp.exponent`, HTTPS VIEW/BROWSABLE, OPEN_DOCUMENT_TREE, VIEW of `*/*`, MAIN/LAUNCHER, MAIN/HOME, and AndroidX camera vendor actions.

## Recommended next Android checks

1. Wait for the pending APK; identify it as a debug Expo development client. Use its merged manifest only to guide DEBUG checks.
2. Exercise MainActivity with unknown `slope:` and malformed `exp+slope:` URIs without any account, and confirm it cannot create a link or enter protected screens.
3. Attempt explicit launch of DevLauncherActivity, AuthActivity, PreviewActivity from a harmless local intent sender; document which open/deny. Don't send OAuth credentials or real callback material.
4. Send only harmless synthetic TODAY_UPDATED/widget update and boot/replacement-shaped broadcasts. Verify each does no authorization change, unlink or deletion; do not dispatch DeviceOwnerReleaseReceiver's action.
5. For NET-01, verify the release merged manifest/packaged APK has no cleartext allowance and no debug proxy trust configuration; this DEBUG manifest explicitly allows cleartext.
6. For AND-05, static manifest excludes backup data, but device backup/restore behavior still needs an AVD check.
