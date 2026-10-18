# 独立レビュー: Android Security Test Plan applicability

- 対象 HEAD: `0ddfc7e` (`SECURITY_TEST/ANDROID_SECURITY_TEST_PLAN.md`)
- 実施日: 2026-10-18 (Asia/Tokyo)
- 作業範囲: 読み取り専用のソース、lock、Gradle設定確認。ファイル作成はこの review ディレクトリ内だけ。
- 未実施: install/update、dependency scanner、APK build、ADB/AVD、server start/API request、DB/env read、外部scan。
- 作業開始時の既存 untracked: `docs/ANDROID_EMULATOR_SETUP.md`, `inst_user_settings.tmp`。変更していない。

## 結論

IPA-06 はコード上のファイル入出力機能が見つからず N/A候補。IPA-07 は外部プロセス起動呼出しが見つからず N/A候補。IPA-08 はサーバがレスポンスヘッダを設定する箇所はあるが、ユーザー制御値をヘッダへ渡す機能は静的検索で見つからず、実リクエスト未試験のため BLOCKED。IPA-09 はAPIがBearerを明示的に付ける実装であり Cookie自動送信の更新APIは静的検索で見つからないため N/A候補。IPA-11 は npm lock 2本とAndroid Gradle定義に明白な版数固定・npm lock整合を確認。APK/Gradle lock/SBOMと全推移依存のアドバイザリ照合は未実施で BLOCKED。IPA-15 は設定行の削除とfamily unlink等の破壊的操作が実装されている。バックアップ/復元機能は見つからないが、操作の認可・監査・復旧確認は未実施につき BLOCKED。

## 構成・稼働状況

- Root `package-lock.json`: lockfileVersion 3、731個のnode_modules package entries。`backend/package-lock.json`: lockfileVersion 3、123 entries。双方存在。package-lock の package root は package.json の直接依存宣言と同じ。
- Main exact lock versions sampled: `hono` 4.13.13, `@hono/node-server` 2.1.5, `react-native` 0.88.0, `expo` 58.0.12, `jose` 6.2.12。
- Backend direct deps: `dotenv` ^18.0.8, `drizzle-orm` ^0.45.4, `postgres` ^3.4.9; dev: `drizzle-kit` ^0.31.11, `tsx` ^4.23.15, TypeScript ^7.0.2, `vitest` ^5.0.5。`esbuild` override ^0.28.2。
- Android: `modules/kit-native/android/build.gradle` が Room 2.8.4、Kotlin coroutines Android 1.10.2、JUnit 4.13.2 を宣言。rootProject 由来の KSP version を参照。Gradle wrapper、Gradle dependency lockfile、APK/SBOM は確認できず、このファイル単独では解決済み推移依存版を証明できない。
- `Get-NetTCPConnection` で localhost開発の標準候補 port 3000/3001/8787/5432 の LISTEN を検出しなかった。開発APIを現在実行中と確認できない。ポート範囲は限定チェックであり他portの不存在は主張しない。
- `backend/src/server.ts` の health はDB疎通をチェックし成功時 `{status: ok, database: ok}`、失敗時503 `{status: unavailable}`。health APIは起動DB接続が前提。未知routeは404。この確認はコード読解であり、HTTP応答検査ではない。
- APIの bearer token は `src/lib/api.ts` に Authorization header で付与。`src/server/app.ts` はHono APIと共通エラー応答を組み立てる。

## IPA重点項目

| ID | 判定 | 根拠と残件 |
|---|---|---|
| IPA-06 | N/A候補 (静的確認) | `src/server`, `backend/src`, native Java/Kotlinでファイルupload/download/exportやユーザー指定パスを扱う機能は見つからず。静的検索限定。 |
| IPA-07 | N/A候補 (静的確認) | これらのサーバ/native対象内で `child_process`, exec/spawn 系プロセス起動が見つからず。静的検索限定。 |
| IPA-08 | BLOCKED | Node serverは固定のContent-Typeヘッダを返す。ユーザー値からのheader/redirect応答生成は見当たらない。Honoの全コードpath確認と入力時の実レスポンスヘッダ検査は未実施。 |
| IPA-09 | N/A候補 (静的確認) | API clientはAuthorization Bearerを明示セット。Cookie/CSRF/Set-Cookie実装は静的検索で見つからず。将来のweb login/API cookie導入で再判定。 |
| IPA-11 | BLOCKED (棚卸し一部確認) | lock数・主要版数・Gradle宣言は上記。APK配布物、Gradle lock、全resolved dependency advisory照合が未完。 |
| IPA-15 | BLOCKED | test-period/blank-period delete、family unlinkと多くのDB削除が存在する。機能なしとは言えない。バックアップ/復旧手順の実証、UIの確認ゲート、認可拒否、監査の確認が必要。DB停止/削除操作は未実施。 |

### IPA-11 Hono GHSA一次情報照合 (2026-10-18)

Root lockはHono 4.13.13。2026-10-18にHono maintainersのGitHub Security Advisoriesを直接確認した。照合した3件はいずれもlocked versionのaffected range外。

- [GHSA-crvj-82cr-hjcx](https://github.com/honojs/hono/security/advisories/GHSA-crvj-82cr-hjcx): affected `<4.13.5`, patched `4.13.5`. Hono query parsing of parameters after URL fragments; applicability requires literal `#` to reach the request URL. 4.13.13 is above the patched version.
- [GHSA-5r4p-p66f-jhc7](https://github.com/honojs/hono/security/advisories/GHSA-5r4p-p66f-jhc7): affected `>=4.12.4, <4.13.11`, patched `4.13.11`. `serveStatic` double-decoding/middleware bypass. The official Hono advisory says no known CVE; OSV surfaced an unusual CVE-2026-109955 mapping, so this report cites the maintainer GHSA ID/range only. Locked 4.13.13 is above the patched version.
- [GHSA-26pp-8wgv-hjvm](https://github.com/honojs/hono/security/advisories/GHSA-26pp-8wgv-hjvm): affected `<4.12.12`, patched `4.12.12`; malformed cookie name write path. Locked 4.13.13 is above the patched version.

These are three targeted GHSA checks, not an exhaustive Hono audit. In particular, fixed version alone does not assess a vulnerability condition or configuration in deployed code. The separate npm audit run and sanitized result are in [npm-audit-summary.md](npm-audit-summary.md).
## ケース台帳 (コード/構成の静的確認を除き、動的ケースは未検証)

- API-01..08, API-12: BLOCKED (APIサーバ未確認稼働、認証データ/ローカルDB試験なし)。API-08はhealth実装と404経路のコード読解のみ。
- API-09..11: BLOCKED (QR lifecycle動的・認可・idempotency未確認)。
- IN-01..12: BLOCKED (入力要求・応答・DB差分未試験)。
- NET-01..08: BLOCKED (APK/実通信/証明書・session/cache動的確認なし)。
- AND-01: BLOCKED (library manifest fragmentのみ読了、merged APK manifestなし)。Manifestにexported receiver/serviceとそのpermission/filterがあり、アプリ全体のentrypoint審査が必要。
- AND-02..14: BLOCKED (APK/AVDなし、Intent/backup/log/UI検査なし)。
- AVL-01..05: BLOCKED (server/DB負荷・障害試験未実施)。
- PII-01..10: BLOCKED (認可・レスポンス・端末保存・ログ・削除後残存を通した検証なし)。
- IPA-01..05, IPA-10, IPA-12..14: BLOCKED (動的ケース未実施)。IPA-06/07/09は上記N/A候補。IPA-08/11/15は上記BLOCKED。

## 実施前に必要なもの / blocker

1. API検査には、envを閲覧・出力せずに安全確認したテスト専用設定、localhostだけに接続するdev server、明示的なテスト用DB（本番/Preview資格情報なし）が必要。現時点で稼働は確認できないためサーバに接続していない。
2. API実装は root Hono server (`src/server/dev.ts`) と別の health-only backend server (`backend/src/server.ts`) を混同しない。前者はAPIケース用、後者はDB health/404のケース用。
3. Android項目にはAPK生成、専用AVDのAPI levelと localhost転送先の可視確認が必要。今回ADB/buildは実行していない。
4. IPA-15では削除操作を先に行わない。テストDB上に可逆な合成rowを作り、復元検証方法を確立した後に権限拒否/限定範囲の試験を実施する。
5. IPA-11を閉じるには npm lock双方の全直接・推移依存を機械的に照合し、Gradle resolved dependency/SBOMと、使用する実APKのcomponent/SDK一覧を対応づける。現レビューではnpm install/auditを行っていない。

## 変更・安全性

- 変更ファイル: この `review/` 内の報告書のみ。
- ソース、依存、環境ファイル、DB、サーバは変更・読取・起動していない。ネットワークアクセスは公開OSVページ検索だけ。スキャン/DoS/実ユーザーアクセスなし。

## 追補: 隔離Expo Android project / AND-01, NET-01 (2026-10-18)

親が生成した `tmp/android-security-build/android` を読み取り専用で確認。Gradle task `:app:assembleDebug` は親側で実行中と聞いている。こちらからGradleを起動せず、SDK/cacheも読まず、APK/merged manifestはまだ見当たらなかったため、以下は生成前 manifest/設定の静的所見。

- AND-01: app manifestでは `.MainActivity` が `exported=true`, `launchMode=singleTask` でMAIN/LAUNCHERとBROWSABLE/DEFAULTのdeep-link filterを公開し、schemeは `slope` と `exp+slope`。意図的公開候補。`CAMERA`, `INTERNET`, `READ_EXTERNAL_STORAGE` (maxSdk 32), `WRITE_EXTERNAL_STORAGE` (maxSdk 32), `SYSTEM_ALERT_WINDOW`, `VIBRATE` を宣言。自動生成 manifest上のreceiver/service一覧は見当たらない。merged release APKの実効component一覧はAPK待ちでありAND-01はBLOCKEDのまま。
- NET-01: main manifestには `usesCleartextTraffic` / `networkSecurityConfig` 指定がない。一方 `src/debug/AndroidManifest.xml` と `src/debugOptimized/AndroidManifest.xml` は `android:usesCleartextTraffic="true"` を明示している。これはdebug variantに限る意図か、release merged manifestで混入しないことを確定するにはbuild outputが必要。従ってdebugは平文HTTPを許す設定であることを明記し、releaseはBLOCKED (effective merged manifest未確認)。
- バックアップ設定の追加根拠: main manifestに `allowBackup=false`, `dataExtractionRules=@xml/slope_data_extraction_rules`。同XMLはcloud backup/device transferのroot/file/database/sharedpref/external各domainをすべて `.` 除外。静的設定のみでOS実挙動は未検証。
- release signing: app/build.gradleはreleaseに`signingConfigs.release`指定。`SLOPE_UPLOAD_*` 4値が不足する場合release prebuild checkで失敗し、debug keyへfallbackしない設計。EAS_BUILD=trueの例外条件はある。debug buildはdebug keystoreを使う。鍵の実値や鍵ファイルは読んでいない。release鍵設定の有効性は未確認。
- build status: このレビュー時点では `app/build/outputs/apk` と `app/build/intermediates/merged_manifests` が確認できず、installable artifactの有無は未確定。APKができた後に parent がAPK manifest/署名を確認する必要あり。

