# Android アプリの中身（静的な確認） — テスト結果

計画: [ANDROID_SECURITY_TEST_PLAN.md](ANDROID_SECURITY_TEST_PLAN.md)
担当: AND-01、AND-05（設定の部分）、AND-12、NET-01、NET-02（設定の部分）、IPA-11（Android の部分）、IPA-14（設定の部分）。あわせて release 署名（🔴2 の修正）の確認
役割: 調べる役。アプリのコード（src/・modules/・plugins/・contracts/）は変えていない。穴は直していない。APK は端末に入れていない（adb・仮想端末・実機・Metro・テスト用サーバには触っていない）。

## 共通の条件

| 項目 | 内容 |
|---|---|
| 日時 | 2026-10-18 14:50〜16:00（JST） |
| 対象のコード | 作る専用の worktree `sp_2602-sectest-build`（detached `0ddfc7e`）。アプリのコードはブランチ `security/android-security-test-plan`（`b7aa9be`）と同じ（差はテストと記録だけ） |
| release APK | `app-release.apk`（134,422,720 バイト）SHA-256 `9c01280628d41207fa4994426f13f389ebfe967317cf78c2870ad480f1353f67` |
| debug APK | `app-debug.apk`（289,223,079 バイト。別の担当が 14:42 に作ったもの）SHA-256 `08d2a163ab3ea8c34f55ff2d0bb82c74b745d12c0aec006b8835529ee1dece87` |
| version | 1.0.0（versionCode 1）。package `com.quedotcom.androidslope`。minSdk 24・targetSdk 36・compileSdk 37 |
| Android API level / AVD | 対象外（端末に入れていない。APK の中身だけ） |
| 接続先 | release は `EXPO_PUBLIC_API_URL=https://example.invalid`（通信しない値）、`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` は空で作った。通信はしていない |
| release の作り方 | `GRADLE_USER_HOME=sp_2602-sectest-build\.gradle-home` を付けて `.\gradlew.bat assembleRelease --no-daemon`（prebuild はやり直していない。55 分）。署名は確かめ専用の使い捨ての鍵（PKCS12・alias `sectest`・乱数のパスワード）を環境変数 `SLOPE_UPLOAD_*` で渡した。`GRADLE_USER_HOME` を分けたので、PC のユーザーごとの本番の鍵の設定は読まれていない |
| 使い捨ての鍵 | 確かめのあとフォルダごと消した（16:00）。鍵とパスワードはこの記録に書いていない |
| 道具 | `aapt2 dump xmltree / dump resources`（build-tools 37.0.0）、`apksigner verify --print-certs`、APK を zip として展開してバイト列を検索（dex・so・Hermes の bundle・arsc・assets を全部）、`gradlew :app:dependencies` |
| 証拠 | 手元の作業フォルダ（scratchpad）にだけ置いた。リポジトリには入れていない（APK・展開物が大きく、値を伏せる前の生の出力のため）。下の各ケースに要点を書いた |
| 秘密の値 | 見つけた値そのものは書いていない（種類と場所だけ）。公開してよい値（パッケージ名・公開の証明書の指紋）だけ書いた |

判定: PASS（期待どおり）／FAIL（期待に反するものを見つけた）／BLOCKED（この条件では確かめられない）／N/A（対象がない）。

## まとめ

| ケース ID | 判定 | 一言 |
|---|---|---|
| AND-01 | PASS（注意2点） | release で外から呼べる部品は8つ。どれも OS だけが送れる放送・OS の権限で守られた入口・ランチャーと deep link。debug だけの開発用の画面（dev-launcher・Compose の PreviewActivity など）は release にない。注意: ウィジェットの受け手が権限なしで外から呼べる（描き直すだけ）。使っていなさそうな権限がある |
| AND-05（設定） | PASS | release・debug とも `allowBackup=false`。`dataExtractionRules` がクラウドのバックアップと端末の引っ越しの両方で全部の場所を外す。`fullBackupContent` はない（`allowBackup=false` なので要らない） |
| AND-12 | **FAIL**（低・条件付き） | サーバの秘密・秘密鍵・DB の接続文字列・Google のシークレットはない。ただし release の JS（Hermes の bundle）に **MOCK のデモの人の決まった合言葉（Bearer token）3つ** とログインの idToken 3つが入っている。MOCK=1 のサーバにだけ効く |
| NET-01 | PASS | release は `usesCleartextTraffic` なし・`networkSecurityConfig` なし（targetSdk 36 なので平文は止まる）。平文の許可は debug の Manifest（`src/debug`）だけ |
| NET-02（設定） | PASS | release に `networkSecurityConfig` がないので、OS の標準どおりユーザーが入れた CA を信じない。証明書の確認を外すコード（全部信じる TrustManager など）も見当たらない |
| IPA-11（Android） | PASS（脆弱性の照合は範囲外） | release の依存は 226（debug は 334）。expo-dev-launcher・dev-menu は release では空の差し替え（クラス2つ）だけ。flipper・leakcanary・stetho・Compose の tooling はない。R8 の縮小あり・`debuggable` なし。Gradle の依存を固定するファイル（lockfile）はない |
| IPA-14（設定） | PASS（注意1点） | deep link は scheme `slope`（と `exp+slope`）だけ、host の指定なし。https の App Links はない。Google ログインは端末の Google（Play 開発者サービス）の画面で行い、OAuth の戻り先の URL scheme はない。URL の引数に合言葉を入れる画面はない。注意: 開発用の `exp+slope` が release にも残る |
| 参考: release 署名（🔴2） | PASS | release は使い捨ての鍵で署名された（debug 鍵 SHA-1 `5E:8F:16:…` ではない）。鍵の設定がないと `slopeCheckReleaseSigning` が止める（debug 鍵には戻らない） |

件数（担当の7ケース）: PASS 6 / FAIL 1 / BLOCKED 0 / N/A 0。参考の署名の確認は PASS。

---

## AND-01 Manifest の exported と権限の一覧

```text
ケースID: AND-01
判定: PASS（注意2点）
日時: 2026-10-18 15:50（JST）
APK version / SHA-256: 1.0.0 / release 9c012806…3f67・debug 08d2a163…ce87
Android API level / AVD: 対象外（静的）
接続先: 通信なし
テスト用アカウント役割: なし
手順:
  1. aapt2 dump xmltree --file AndroidManifest.xml で release と debug の結合後の Manifest を出す
  2. activity / service / receiver / provider ごとに exported・permission・intent-filter を表にし、release と debug を比べる
  3. 外から呼べる受け手（modules/kit-native の Kotlin）が intent の中身をどう使うかを読む
期待結果: 外部公開は必要最小限。内部専用の部品は非公開か、署名・OS の権限で守る
実結果: 下の表。release で exported="true" は8つ。権限なしで外から呼べる自作の入口は MainActivity とウィジェットの受け手だけ
HTTP status / 相関ID: 対象外
証拠ファイル: scratchpad の release-manifest.txt・debug-manifest.txt（Manifest のダンプ）
影響と再現頻度: 注意2点（下）は低
```

### release で exported="true" の部品

| 部品 | 種類 | 守り（permission） | intent-filter | 見立て |
|---|---|---|---|---|
| `MainActivity` | activity | なし | MAIN/LAUNCHER、VIEW + BROWSABLE（scheme `slope`・`exp+slope`） | ランチャーと deep link の入口（要る）。画面ごとの守りは IPA-14 |
| `kitnative.widget.SlopeWidget` | receiver | **なし** | `APPWIDGET_UPDATE`、`dev.hackathon.kit.kitnative.TODAY_UPDATED` | 注意1。ほかのアプリが送れるが、描き直すだけ（extra は読まない） |
| `kitnative.admin.SlopeDeviceAdminReceiver` | receiver | `BIND_DEVICE_ADMIN` | `DEVICE_ADMIN_ENABLED` | OS だけが送れる |
| `kitnative.admin.DeviceOwnerBootReceiver` | receiver | なし | `BOOT_COMPLETED`・`MY_PACKAGE_REPLACED` | OS だけが送れる放送。action を確かめてから動く |
| `kitnative.admin.DeviceOwnerReleaseReceiver` | receiver | `DUMP` | `RELEASE_DEVICE_OWNER` | Device Owner を外す入口。`DUMP` は adb（shell）にしかないので、ほかのアプリからは送れない |
| `kitnative.engine.BootReceiver` | receiver | なし | `BOOT_COMPLETED`・`MY_PACKAGE_REPLACED` | OS だけが送れる放送。監視を再開するだけ |
| `com.google.android.gms.auth.api.signin.RevocationBoundService` | service | `…signin.permission.REVOCATION_NOTIFICATION` | なし | Google の部品。Google の権限で守られる |
| `androidx.profileinstaller.ProfileInstallReceiver` | receiver | `DUMP` | INSTALL_PROFILE ほか | 標準の部品。adb だけ |

exported="false"（または指定なしで intent-filter なし）: `MonitorService`、`WebGuardService`（`BIND_ACCESSIBILITY_SERVICE`）、`StatusReportReceiver`、`FileSystemFileProvider`（`grantUriPermissions=true`。範囲はアプリの files と cache 全体。アプリが URI を渡したときだけ読める）、ML Kit・Google ログイン・CameraX・datatransport・androidx.startup・Room の部品。

### debug にだけある部品（release にはない）

| 部品 | exported | 中身 |
|---|---|---|
| `expo.modules.devlauncher.launcher.DevLauncherActivity` | true | 開発用の起動画面 |
| `expo.modules.devlauncher.compose.AuthActivity` | true | scheme `expo-dev-launcher` |
| `expo.modules.devlauncher.launcher.errors.DevLauncherErrorActivity` | （なし） | 開発用のエラー画面 |
| `com.facebook.react.devsupport.DevSettingsActivity` | false | 開発メニュー |
| `androidx.compose.ui.tooling.PreviewActivity` | **true（権限なし）** | Compose の確認用の画面。debug だけ |
| `org.jetbrains.compose.resources.AndroidContextProvider` | false | — |

debug の `<application>` には `debuggable=true`・`usesCleartextTraffic=true` が付く。release には両方ない。

### 権限（release）

`CAMERA`、`INTERNET`、`ACCESS_NETWORK_STATE`、`READ_EXTERNAL_STORAGE`（maxSdk 32）、`WRITE_EXTERNAL_STORAGE`（maxSdk 32）、`SYSTEM_ALERT_WINDOW`、`VIBRATE`、`RECEIVE_BOOT_COMPLETED`、`PACKAGE_USAGE_STATS`、`QUERY_ALL_PACKAGES`、`FOREGROUND_SERVICE`、`FOREGROUND_SERVICE_SPECIAL_USE`、`POST_NOTIFICATIONS`、`USE_FULL_SCREEN_INTENT`、`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`、`com.quedotcom.androidslope.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`（自分用・signature）。
debug にだけある: `CHANGE_WIFI_MULTICAST_STATE`、`ACCESS_LOCAL_NETWORK`（dev-launcher が開発用のサーバを探すため）、`<queries>` の `host.exp.exponent`。

### 注意

1. **ウィジェットの受け手（`SlopeWidget`）が権限なしで外から呼べる。** 自分のアプリ用の action `TODAY_UPDATED` も、ほかのアプリが送れる。中身（`SlopeWidget.kt`）は描き直すだけで intent の extra を読まないので、データを読まれたり書き換えられたりはしない。何度も送られると描き直しが増えるだけ。Android の公式の例ではウィジェットの受け手を `exported="false"` にしている（Slope で動くかは未確認）。直すなら `exported="false"` にするか、`TODAY_UPDATED` を別の非公開の受け手に分ける。
2. **使っていなさそうな権限がある。** `READ/WRITE_EXTERNAL_STORAGE`（maxSdk 32）・`VIBRATE`・`SYSTEM_ALERT_WINDOW` は prebuild が作る `android/app/src/main/AndroidManifest.xml` に入っている（`SYSTEM_ALERT_WINDOW` は kit-native も宣言し、理由がある）。外部ストレージを読み書きするコードは見当たらない。要るかどうかは AND-10 で確かめる。`QUERY_ALL_PACKAGES` は kit-native の Manifest のコメントどおり、外すかどうかが未決。

## AND-05（設定の部分） バックアップの設定

```text
ケースID: AND-05（設定の部分）
判定: PASS
日時: 2026-10-18 15:52（JST）
APK version / SHA-256: 1.0.0 / release 9c012806…3f67・debug 08d2a163…ce87
Android API level / AVD: 対象外（静的）
接続先: 通信なし
テスト用アカウント役割: なし
手順:
  1. 結合後の Manifest の <application> で allowBackup・dataExtractionRules・fullBackupContent を見る
  2. dataExtractionRules が指す xml（release は res/tk.xml = xml/slope_data_extraction_rules）を aapt2 で出す
  3. それを書く plugins/with-android-no-backup.ts を読む
期待結果: 秘密情報・個人データをバックアップ対象に入れない
実結果:
  - release・debug とも android:allowBackup=false（Android 11 以前は adb backup もクラウドのバックアップも止まる）
  - dataExtractionRules（Android 12 以降）: <cloud-backup> と <device-transfer> の両方で root・file・database・sharedpref・external・device_root・device_file・device_database・device_sharedpref を全部 exclude
  - fullBackupContent はない（allowBackup=false なので要らない）
  - plugin が prebuild のたびにこの2つを書くので、android/ を作り直しても消えない
HTTP status / 相関ID: 対象外
証拠ファイル: scratchpad の release-manifest.txt と aapt2 の res/tk.xml のダンプ
影響と再現頻度: なし
```

端末の中に何が平文で残るか（データの領域・SharedPreferences など）は動的な担当（RESULTS_ANDROID_DYNAMIC.md）の範囲で、ここでは見ていない。

## AND-12 APK の中の文字列・BuildConfig・assets・ネイティブの文字列

```text
ケースID: AND-12
判定: FAIL（低・条件付き）
日時: 2026-10-18 15:53（JST）
APK version / SHA-256: 1.0.0 / release 9c012806…3f67・debug 08d2a163…ce87
Android API level / AVD: 対象外（静的）
接続先: 通信なし
テスト用アカウント役割: なし
手順:
  1. release と debug の APK を zip として scratchpad に展開する
  2. 全部のファイル（classes*.dex・lib/*/*.so・assets/index.android.bundle（Hermes のバイトコード）・resources.arsc・assets/app.config など）を
     バイト列として検索する。探した形: "-----BEGIN"・"PRIVATE KEY"・postgres の接続文字列・"DATABASE_URL"・"mock-token"・"mock-google"・
     Google のシークレット（GOCSPX-）・Google の API キー（AIza）・Google のクライアント ID・AWS のキー・JWT の形・"Bearer " の固定値・
     neon.tech・vercel.app・http:// のつなぎ先・10.0.2.2・127.0.0.1・localhost・秘密の環境変数の名前・gmail のアドレス・デモの固定値・
     作った PC のパス
  3. 生成された BuildConfig（アプリと全ライブラリの release）と、aapt2 dump resources の文字列を見る
  4. 見つけたものを、近くの文字列（前後数十文字）で何かを見分ける
期待結果: サーバの秘密・秘密鍵・固定 token・個人情報を含まない。公開のクライアント識別子は権限が限られる
実結果: 下の表。サーバの秘密・秘密鍵・DB の接続文字列・Google のシークレットは release にも debug にもない。
  ただし release の JS に MOCK のデモの人の決まった合言葉（固定 token）が入っている
HTTP status / 相関ID: 対象外
証拠ファイル: scratchpad の scan-release.txt・scan-debug.txt（値を含む生の出力なので、リポジトリには入れていない）
影響と再現頻度: 下の「FAIL の中身」
```

| 探したもの | release | debug | 見立て |
|---|---|---|---|
| 鍵の形（`-----BEGIN`・`PRIVATE KEY`） | なし | なし | — |
| postgres の接続文字列・`DATABASE_URL`・neon.tech | なし | なし | サーバの秘密は入っていない |
| Google のシークレット（`GOCSPX-`）・API キー（`AIza`） | なし | なし | — |
| Google の Web クライアント ID | なし | なし | 今回は空で作ったため。入れて作れば JS に入る（公開してよい値。サーバが audience を確かめる） |
| JWT の形・`Bearer ` の固定値・AWS のキー | なし | なし | — |
| **`mock-token-…`（MOCK のデモの人の合言葉）** | **3つ（bundle）** | なし（debug の APK に JS はない） | **FAIL の中身** |
| **`mock-google-…`（MOCK のログインの idToken）** | **3つ（bundle）** | なし | 同上 |
| デモの人の userId（固定の uuid 3つ）・デモの QR の番号の見本 | bundle に1つずつ | なし | `contracts/fixtures.ts` の見本。サーバが作る本物の QR の番号ではない |
| 秘密の環境変数の名前（`SLOPE_UPLOAD_*_PASSWORD` など） | なし | `assets/app.fingerprint` に名前だけ | debug だけ。fingerprint にビルドの設定ファイルの中身（名前だけで値はない）が入る。release の APK に `app.fingerprint` はない |
| 使い捨ての鍵の名前（CN） | なし（APK の署名の部分を除く） | なし | — |
| gmail のアドレス | 1つ（bundle） | なし | ライブラリの作者の連絡先（公開のパッケージ情報）。アプリの利用者の個人情報ではない |
| http:// のつなぎ先 | `localhost:8081`（bundle・libreactnative.so・arsc）、`10.0.2.2`（dex） | 同じものと `localhost:19006` | React Native・Expo の開発用のサーバの決まった値。release では使われない |
| アプリのつなぎ先 | `https://example.invalid`（作るときに入れた値） | — | 既定の `http://10.0.2.2:3000` は畳まれて残っていない |
| 作った PC のパス（`C:/Programms/sp_2602-sectest-build/.gradle-home/…`） | ネイティブの .so（libappmodules・codegen の so、4 ABI） | — | 情報としては低い（ユーザー名は入っていない）。C++ のファイル名の埋め込み |
| BuildConfig | `DEBUG=false`、BUILD_TYPE・VERSION・機能の on/off だけ | — | 秘密なし |
| resources.arsc の文字列 | 秘密らしい名前なし（`password_toggle` など UI の部品だけ） | — | — |

### FAIL の中身

- release の JS（`assets/index.android.bundle`）に、`contracts/fixtures.ts` の `mockSessions` と `mockLogins` が入っている。
  中身は、MOCK のときのデモの保護者・デモの子ども・はじめての人の **決まった合言葉（Bearer token）3つ** とログイン用の idToken 3つ。
- 入る道すじ: `src/lib/google.ts` が `mockLogins` を import し、`mockLoginChoices()` を export している。Metro は使っていない export を消さないので、
  `contracts/fixtures.ts` の全体（`mockSessions` を含む）が bundle に入る。
  今回は Google のクライアント ID を空で作ったので、ログイン画面に MOCK のボタンも出る。
  **クライアント ID を入れた本番向けの release でも同じ文字列が残ると見込む（作り分けは時間がかかるので確かめていない）。**
- 影響: サーバは `MOCK=1` かつ `VERCEL_ENV≠production` のときだけ、この合言葉と idToken を受け付ける（`src/server/env.ts` の `isMock`、`src/server/auth.ts` の
  `notExists(mockLogin)`）。本番のサーバ（MOCK なし）では効かない。ただし **MOCK=1 で外から届くサーバ（デモ用・preview など）があると、
  APK を持つ人なら誰でもデモの保護者・デモの子どもとして API を使える**（合言葉は固定で、ログアウトしても次のログインで戻る）。値はリポジトリにも書いてある。
- 直し方の例（直す役へ）: release の bundle に MOCK の見本を入れない（`__DEV__` や作るときの値で import を分ける）。
  外から届くサーバでは MOCK=1 にしない（デモのつなぎ先を決めるときに確かめる）。

## NET-01 平文の通信の許可・networkSecurityConfig

```text
ケースID: NET-01
判定: PASS
日時: 2026-10-18 15:52（JST）
APK version / SHA-256: 1.0.0 / release 9c012806…3f67・debug 08d2a163…ce87
Android API level / AVD: 対象外（静的）
接続先: 通信なし
テスト用アカウント役割: なし
手順:
  1. 結合後の Manifest の <application> で usesCleartextTraffic・networkSecurityConfig を release と debug で比べる
  2. APK の xml の資源の一覧（aapt2 dump resources の xml/…）に network_security_config があるかを見る
  3. つなぎ先を決めるコード（src/lib/api.ts・modules/kit-native の StatusReporter.kt）と、作った bundle の中のつなぎ先を見る
期待結果: リモートでは HTTPS 必須。HTTP を許すのはローカルの debug だけ
実結果:
  - release: usesCleartextTraffic なし・networkSecurityConfig なし。targetSdk 36 なので OS の標準で平文は止まる。xml の資源に network_security_config はない
  - debug: usesCleartextTraffic=true（android/app/src/debug/AndroidManifest.xml。debug の作り方にだけ混ざる）。どの host にも平文を許す（debug だけなので計画の条件内）
  - JS のつなぎ先は EXPO_PUBLIC_API_URL。空のときの既定は http://10.0.2.2:3000（エミュレータから見た PC）。release でこれを空のまま作ると、平文が OS で止まり、つながらない（安全側に失敗）
  - Kotlin の StatusReporter は http・https の URL を受け付けるが、release では OS が平文を止める。リダイレクトは追わない
HTTP status / 相関ID: 対象外
証拠ファイル: scratchpad の release-manifest.txt・debug-manifest.txt（d.txt・r.txt は比べたもの）
影響と再現頻度: なし
```

実際の通信（release で http が本当に止まるか）は端末に入れていないので見ていない。

## NET-02（設定の部分） ユーザーが入れた CA を信じないか

```text
ケースID: NET-02（設定の部分）
判定: PASS
日時: 2026-10-18 15:54（JST）
APK version / SHA-256: 1.0.0 / release 9c012806…3f67
Android API level / AVD: 対象外（静的）
接続先: 通信なし
テスト用アカウント役割: なし
手順:
  1. release の Manifest に networkSecurityConfig がないことを見る（NET-01 と同じ）
  2. release の classes.dex で、証明書・host の確認を外す名前（TrustAll…・ALLOW_ALL_HOSTNAME_VERIFIER・NullHostnameVerifier・InsecureTrust…・user_certificates）を探す
  3. アプリと kit-native のコードで TrustManager・HostnameVerifier を差し替えていないかを見る
期待結果: release は不正な証明書・ユーザーが入れた CA の接続を拒否する
実結果:
  - networkSecurityConfig がないので、targetSdk 24 以降の OS の標準（system の CA だけを信じる。user の CA は信じない）
  - 証明書の確認を外す名前は見当たらない（OkHttp の標準の CleartextTrafficPermitted の確認だけがある）
  - kit-native は標準の HttpURLConnection で、TrustManager・HostnameVerifier を差し替えていない
HTTP status / 相関ID: 対象外
証拠ファイル: scratchpad の release の展開物の検索結果
影響と再現頻度: なし
```

debug 版にも networkSecurityConfig がないので、debug 版もユーザーが入れた CA を信じない（通信を覗く動的な確認では、そのままではプロキシの証明書を受け付けない）。実際にプロキシで拒否されるかは端末での確認（動的）。

## IPA-11（Android の部分） Gradle の依存・debug 用の部品が release に混ざっていないか

```text
ケースID: IPA-11（Android の部分）
判定: PASS（脆弱性の情報との照合は範囲外）
日時: 2026-10-18 15:57（JST）
APK version / SHA-256: 1.0.0 / release 9c012806…3f67・debug 08d2a163…ce87
Android API level / AVD: 対象外（静的）
接続先: 通信なし
テスト用アカウント役割: なし
手順:
  1. gradlew :app:dependencies --configuration releaseRuntimeClasspath / debugRuntimeClasspath で一覧を出し、group:name:版 の集合にして比べる
  2. expo-modules-autolinking resolve -p android で、つながっている Expo のネイティブの部品を一覧にする
  3. release の APK の dex で、開発用の部品のクラス（expo/modules/devlauncher・devmenu、flipper・leakcanary・stetho、Compose の tooling）を探し、debug と数を比べる
  4. android/gradle.properties・app/build.gradle の release の設定（minify・debuggable）を見る
期待結果: 開発用の部品が release に混ざらない。依存がたどれる
実結果:
  - 依存の数: release 226・debug 334。debug にだけあるのは Compose 一式（ui-tooling を含む）・navigation・composables・gson 2.13 など、dev-launcher・dev-menu の画面の部品
  - expo-dev-client・expo-dev-launcher・expo-dev-menu は release でも project としてつながるが、release では src/disableInRelease の空の差し替えに変わる
    （gradle.properties に expo.devlauncher.configureInRelease はない）。release の dex に残るのは DevLauncherPackage・DevMenuPackage の2クラスだけ（debug は 1,072）
  - flipper・leakcanary・stetho・chucker はどちらにもない。Compose の PreviewActivity は debug だけ
  - release: android.enableMinifyInReleaseBuilds=true（R8 で縮める）、debuggable なし、BuildConfig.DEBUG=false
  - React Native の devsupport の一部（HMRClient・LogBoxModule・inspector など）は release の dex にも残る。React Native の本体の作りで、release では使われない
  - Expo のネイティブの部品（autolinking）: expo 58.0.12・expo-camera 58.0.10・expo-router 58.0.21・expo-dev-client 58.0.13 ほか 21 個と kit-native。React Native 0.88.0
  - 通信の部品は okhttp 4.9.2（React Native が使う版）
HTTP status / 相関ID: 対象外
証拠ファイル: scratchpad の deps-release.txt・deps-debug.txt・dr.txt・dd.txt（一覧と比べたもの）
影響と再現頻度: なし（下の気づきは記録だけ）
```

気づき（記録だけ。判定には入れていない）:
- Gradle の依存を固定するファイル（gradle.lockfile・verification-metadata.xml）はない。android/ は生成物で Git に入らないので、版は npm の package-lock.json と各ライブラリの build.gradle で決まる。
- 計画 IPA-11 の手順 3（IPA・JVN の脆弱性の情報との照合）はこの担当ではしていない。okhttp 4.9.2 などの照合は別に行う。

## IPA-14（設定の部分） Deep Link の scheme・host、OAuth の戻り先

```text
ケースID: IPA-14（設定の部分）
判定: PASS（注意1点）
日時: 2026-10-18 15:56（JST）
APK version / SHA-256: 1.0.0 / release 9c012806…3f67・debug 08d2a163…ce87
Android API level / AVD: 対象外（静的）
接続先: 通信なし
テスト用アカウント役割: なし
手順:
  1. release と debug の Manifest で、VIEW + BROWSABLE の intent-filter の scheme・host・path、autoVerify（App Links）を見る
  2. app.json の scheme と plugins、src/app の画面の一覧（expo-router は URL の path を画面に対応させる）、各 _layout の守りを読む
  3. ログインの作り（src/lib/google.ts・@react-native-google-signin）と、外のブラウザ・WebBrowser・AuthSession・redirectUri を使う所を探す
  4. URL の引数を読む画面（useLocalSearchParams）と、QR の中身の形を見る
期待結果: 許可した認証先だけを使い、偽の host からログイン済みの状態を作れず、合言葉を URL に入れない
実結果:
  - deep link: MainActivity の scheme slope と exp+slope だけ。host・path の指定なし。https の App Links（autoVerify）はない
  - debug にだけ scheme expo-dev-launcher（AuthActivity）がある。release にはない
  - OAuth: Google ログインは Play 開発者サービスの画面（SignInHubActivity・exported=false）で行い、ID トークンを受け取ってサーバへ送る。
    OAuth の戻り先の URL scheme（com.googleusercontent.apps.…）は Android の Manifest にない（app.json の iosUrlScheme は iOS 用の仮の値で、Android には入らない）。
    外のブラウザ・WebBrowser・AuthSession は使っていない
  - 画面の守り: parent/ は「ログイン済みで role=parent」、child/ は「role=child」、pair/ は「ログイン済み」でないと / に戻す（各 _layout の Redirect）
  - URL の引数を読む画面は3つ（child/schedule-edit/[id]・pair/status の reason と role・pair/usual-limit の from）。合言葉や QR の番号を URL で受け取る画面はない
  - QR の中身は番号の文字列だけ（URL ではない）。カメラのアプリで読んでも Slope の deep link にはならない
HTTP status / 相関ID: 対象外
証拠ファイル: scratchpad の release-manifest.txt・debug-manifest.txt、src/app・src/lib/google.ts・components/pair の読んだ所
影響と再現頻度: 注意1点（下）は低
```

注意: `exp+slope` の scheme（expo-dev-client が足す開発用の scheme）が release の Manifest にも残る。release では dev-launcher が空の差し替えなので、`slope` と同じ MainActivity に届くだけ。入口が1つ増えるので、要らなければ外す。偽の host・知らない scheme を実際に開く確認（AND-02・AND-03・IPA-14 の手順 2）は端末での確認（動的）の範囲。

## 参考: release 署名（🔴2 の修正の確認）

```text
ケースID: 参考（🔴2 の修正の確認）
判定: PASS
日時: 2026-10-18 15:50〜15:58（JST）
APK version / SHA-256: 1.0.0 / release 9c012806…3f67・debug 08d2a163…ce87
手順:
  1. apksigner verify --print-certs -v で release と debug の署名を見る
  2. 署名の環境変数を外して gradlew :app:slopeCheckReleaseSigning を動かす
期待結果: release は debug 鍵で署名されない。鍵の設定がないときは止まる
実結果:
  - release: v2 で署名・検証 OK。署名者1人。証明書 CN=Slope sectest throwaway、SHA-1 3B:7C:F1:59:66:4C:1A:40:77:B4:64:E2:06:51:31:38:C0:00:41:6E（使い捨ての鍵。もう消した）
  - debug: CN=Android Debug、SHA-1 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25（Expo の雛形の公開の debug 鍵）
  - release が debug 鍵の SHA-1 でないことを確かめた
  - 環境変数なしでは slopeCheckReleaseSigning が「release 版を署名する鍵の設定が足りないので止めました（debug 鍵には戻しません）」で止まった（EXIT=1）
証拠ファイル: scratchpad の signing-check-noenv.log（apksigner の出力は上に書いた）
影響と再現頻度: なし
```

release は v2 だけで署名される（v1 なし）。minSdk 24 なので v2 で足りる。

## 片付け

- 使い捨ての鍵とパスワードのフォルダ（scratchpad\sectest\throwaway）は消した。scratchpad の中に .p12・.jks・.keystore は残っていない。
- 作った release の APK は `sp_2602-sectest-build\android\app\build\outputs\apk\release\app-release.apk` に残る（もう消した使い捨ての鍵で署名したもの。端末には入れていない）。
- `sp_2602-sectest-build` の android/ は prebuild し直していない・消していない。debug の APK は変わっていない（SHA-256 が同じ）。
