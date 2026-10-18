# Android / API セキュリティ検査結果

実施日: 2026-10-18。**ユーザー指示により一時停止。全項目の合格や検査完了を示す報告ではありません。**

## 対象と隔離

- ソース: `security/android-security-test-plan` / `0ddfc7e`。
- Android: `SlopeVerify` / `emulator-5556`、Android 17 / API 37。開始時点では対象パッケージ未インストール。
- 対象パッケージ: `com.quedotcom.androidslope`。HEADのアーカイブを `tmp/android-security-build` に展開してビルド。ルートのアプリソース・依存定義は変更していない。
- アプリ用API: `127.0.0.1:4313`、メモリ上の専用PGlite、`MOCK=1`。端末からはADB reverse経由の `http://127.0.0.1:4313`。本番・Preview・実OAuth・実ユーザーデータは使用しない。
- API検査: loopback 4311/4312、架空の親A/子A/親B/子B等。独立したPGlite。
- バックエンドhealth検査: 新規PostgreSQL17クラスタの5439と、起動設定だけを隔離用に調整したサーバー4314。検査後は両方停止済み。
- 分担: 親がAndroidビルド・端末操作・統合、Luna最大3人がAPI、クライアント静的検査、依存・独立レビュー。親モデルの切替は行っていない。

## 現在得られている結果

- 保護対象34経路へ、経路ごとに未認証リクエストを1回、開始間隔1050ms以上で送信し、全件401を確認: [全経路の証跡](android-dynamic/unauthenticated-matrix.json)。
- クライアント選択テスト73件、サーバー選択テスト54件、日付境界テスト27件の計154件が通過。Node/ローカルDBの証拠であり、Android端末での検査とは区別する。
- 親子・家庭間の認可、QR再利用・期限、利用記録の冪等性等: [API検査結果](api/REPORT.md)。
- バックエンド `/health`: 起動200 → DB停止503 → 復旧200、未知パス404: [health検査](android-static/health/HEALTH_CHECK_RESULT.md)。アプリ `/api/health` は別実装で、PGlite強制クローズ時500だった。
- 認証tokenのAsyncStorage/SharedPreferencesへの暗号化なし保存をソース上で確認。端末内SQLiteと `slope_engine.xml` でも合成tokenの平文保存を確認（データ本体は端末外へコピーしていない）: [静的検査](android-static/ANDROID_STATIC_REVIEW.md)。
- npm audit: アプリ側64 affected package entries（4件の元アドバイザリ）、backend側0。これは依存照合のスナップショットで、悪用可能性や安全性を確定しない: [監査結果](review/npm-audit-summary.md)。

## Androidビルドの実行記録

1. Expo prebuildを隔離コピーで実行。dotenvとtelemetryを無効にし、API URLはloopbackへ固定。JavaScript bundle生成成功。
2. JDK25、Gradle9.4.1、compileSdk37 / targetSdk36 / minSdk24、NDK27.1、CMake3.22.1を使用。SDK/Gradleの追加取得先はこのリポジトリの `tmp/`。
3. 初回 `:app:assembleDebug` はMaven Central/Googleの名前解決エラーで依存取得に失敗。ソースのコンパイルエラーとは判定していない。
4. ネットワーク権限を上げて再試行し、React Native/Hermes等の取得に成功。その後Windowsの長いパス制限に対応するため、隔離SDKのNinjaを公式1.13.2へ更新し、CMakeの出力先を短縮。debug APK生成・インストール・実アプリ起動に成功した。

## 計画からの実施差分

API担当の初回バッチで1 req/s間隔が守られなかった。また、runner修正時に8MiB超の単発確認を3回、11回のQR無効コード確認を2回（合計22回）実行し、計画の回数制限を超えた。これは実施上の不備であり、合格証拠で隠さない。すべて隔離ローカル環境だった。後続の補足検査は1秒以上の間隔で行い、これらの負荷ケースの追加実行は停止した。詳細はAPI結果に記録している。

## 未完了

全76ケースの対応表は [CASE_MATRIX.md](review/CASE_MATRIX.md)（PASS28 / FAIL7 / BLOCKED36 / 条件付きN/A5）。部分検査や要件判断待ち・外部前提不足も未完了（BLOCKED）として整理している。問題修正には未着手。debug APKの結果でrelease検査を代用しない。


## Android上で確認済みの動作（追加）

- 実際のSlopeで親・子のデモログイン成功。親のログアウト後はBack・コールド再起動・未認証の親画面Intentでも保護画面へ戻らず、旧tokenのAPIリプレイは401。
- 子のログアウト後は [保存状態](android-dynamic/child-logged-out-storage.json) でsessionRows/configRows/outboxEntriesすべて0、SQLiteとSharedPreferencesの合成tokenマーカーなし。旧tokenも [401](android-dynamic/child-token-after-logout.json)。これは検査した保存領域の結果であり全キャッシュの不在を示さない。
- 使用状況アクセス拒否時の権限説明、OS画面での許可後の使用量表示を確認。検査後GET_USAGE_STATSをdefaultへ戻した。ローカル接続権限はdebug接続用に許可済み。
- 通信断はローカルAPI側で接続を切断して再現（機内モードではない）。古いデータである旨の警告と [保留1件](android-dynamic/child-outage-queued.json) を確認。初回観測では復旧後の保留解消を確認できなかった。その後の追加検査で単一記録のupload200・保留0・警告解消、さらに複数記録の復旧・重複冪等解除・恒久エラー隔離を確認した（末尾の追試参照）。障害フラグは削除済み。
- 通常shellからDBの読み出し、非公開service起動、非公開provider取得は拒否。対象PIDの限定Logcat検査でtoken/Bearer漏えい・fatalは0件: [限定プローブ](android-dynamic/platform-probe.json)。第三者攻撃アプリやログ全期間を網羅した検査ではない。
- APK SHA256: `30D32BF85B749086E4705DBFD6F22343043AA1429E5632FDAFB2A884F5EDDF3A`。debuggable/cleartext有効の開発APKであり本番設定の証拠にはしない。


## Luna medium 4体での追加検査

ユーザー指定に従いLuna mediumを計4体使用。同時枠は親を含め4のため、最初の3体の完了に合わせて4体目を起動した。

- [API追試](api-followup/REPORT.md): 未知・idle期限切れセッション401、別家族の利用履歴403、正規の親による同履歴取得200。JWTではなくopaque sessionのため署名改変ケースはそのまま当てはまらない。
- [利用分数の追試](api-followup/INPUT_MINUTES.md): 2フィールド計14要求、0を受理、それ以外の検査値は400、拒否時のDB行数不変。IN-05全フィールド網羅は未完了。
- [端末追試](android-dynamic/FOLLOWUP.md): 保留1件/network/backoffあり → 復旧後upload200 → 保留0件、警告解消を確認。先行追試で保留が残った観測を上書きせず、新規証拠を追加した。機内モードそのものとは異なる手順。
- 同じ端末追試でカメラ拒否→説明→再要求→今回のみ許可→scanner→中止、HTML風の2名称の一覧・編集での文字列表示を確認。
- [APK追試](apk-followup/REPORT.md): 全1344 ZIP entriesの秘密パターン走査で該当0。完全な解析ではなく、releaseの安全性は未確認。
- [プライバシー棚卸し](privacy-followup/REPORT.md)、[独立レビュー](followup-review/REPORT.md) を追加。独立レビュー時点からの追試結果は上記で更新。
- 現在の共有作業フォルダーは別作業のfeature/d9-usage-window-validation。既存変更は触らず、追加APIも元snapshotの隔離コピーから起動した。ブランチを勝手に戻していない。
- 追加差分: IN-05は既存7要求と今回14要求で少なくとも21要求になり、計画の20回上限を超えた。隔離ローカル・後続の1.05秒以上間隔は維持したが、累積回数管理の不備として記録し、この分類の追加要求を停止した。


## 再開後の親担当による追加検査（第1回）

- [別アプリ検査](platform-app/REPORT.md): 権限なし・別署名・別UIDのAPKからDB読出しと4Provider/2Serviceへのアクセスが拒否。AND-13をPASSへ更新。
- [端末の追加検査](android-dynamic/POST_RESUME.md): MainActivityへの偽role/ID・改変URI・16KiB extraで越権画面は表示されず、AND-03を検査したURI範囲でPASSへ更新。通知・実OAuth・全exported部品の検査とは別。
- 最近使った画面のログイン中プレビューには利用分数と権限状態が露出。ログアウト後はログイン画面へ更新。画面保護要件と通知等の確認が残るためAND-07はBLOCKEDのまま、追加観測として共有。
- タイムゾーンで端末の日付が変わっても、アプリ表示は仕様の日本時間固定を維持。GMTへ復帰。実時計の変更は未検査。
- [Release manifest](release-manifest/REPORT.md) の生成成功。exportedはdebug11→release8。署名検査タスクをManifest解析に限って除外したもので、release APK/署名/TLSの検査成功ではない。
- AND-08は、対象であるアプリ内clipboard/share/file出力機能が見つからないため条件付きN/Aへ整理。QR・通知の問題はPII-06/AND-07に残している。

通常再起動後、有効な保存セッションで子画面と3%表示が復帰し、送信待ち0を確認。その後ユーザー指示で一時停止し、権限復帰・ログアウト・検査プロセス停止を実施した。[再開後の検査と停止位置](android-dynamic/POST_RESUME.md)。


## 再開後の親担当による追加検査（第2回・残作業整理）

詳細は [POST_RESUME_2.md](android-dynamic/POST_RESUME_2.md) を参照。

- **QRライフサイクル（PII-09をPASSへ更新）**:
  - 端末UIで未連携の子としてQR発行（`POST /api/pair/start` 200）→ 取消ボタン操作で `POST /api/pair/cancel` 200・選択画面への復帰を確認。QR秘密はスクリーンショットやログへ保存せず、Window/View構造のみ確認した。
  - 隔離API（17要求・1.1秒以上間隔）で、取消後QRのclaim拒否（409）、再発行による旧QR（`waiting` および `claimed` 状態）の即時失効と409拒否、直接 `signOut` 後のセッション失効による `pairStatus` / `pairConfirm` の401拒否を確認: [QRライフサイクル証跡](api-followup/qr-lifecycle-evidence.json)。
- **通知・ロック画面・QR画面の漏えい経路確認（PII-04 / PII-06 / AND-06 / AND-07更新）**:
  - `MonitorService` のフォアグラウンド通知（channel `slope_engine`、ID `2600`、`IMPORTANCE_LOW`）を `dumpsys notification --noredact` で確認。表示はタイトル `"Slope が使用時間を見守っています"`・本文 `"今日は 3% 使いました"`（`vis=0`、`publicNotification=None`）で、利用分数・アプリ名・トークン・QR秘密の露出なし。
  - QR表示中の `MainActivity` Window（`Window#8`）は `FLAG_SECURE` 未設定を確認。親画面のRecentsプレビューと同様、どの画面に `FLAG_SECURE` を必須とするかの要件決定待ちとして整理。
  - QR発行・取消・通知・複数outbox再送後の対象PID Logcat 4,000行を走査し、合成トークン・`Bearer`・40桁hex QRコード・`FATAL EXCEPTION` いずれも0件を確認: [Logcat追加検査](android-dynamic/logcat-qr-outbox-probe.json)。
- **複数記録の再送・重複送信・成功分のみの解除（NET-04 / AVL-03をPASSへ更新）**:
  - 端末の `slope.usage-outbox` に複数日分の正常保留2件と恒久エラー1件（別childIdで403）を投入し、アプリ起動時の自動flushを検証。正常2件のみ `200` で送信・outboxから削除され、403の1件は `state: "quarantined"`（`attempts: 1`, `errorCode: "forbidden"`）へ隔離された。
  - 受理済み `submissionId` を再度 `pending` として投入した再flushでは、サーバーが冪等に `200`（`duplicate`）を返しoutboxから削除される一方、`quarantined` 項目は再送されないことを確認: [複数outbox証跡](android-dynamic/multi-outbox-evidence.json)。
- **未完了36項目（BLOCKED）の3分類整理**:
  - 残る36件のBLOCKEDを、(A) 外部環境・ビルド前提不足（署名済みrelease APK、HTTPS/TLSテストハーネス、実OAuth、物理カメラ等：18件）、(B) 要件・仕様判断待ち（`FLAG_SECURE` 対象画面、監査ログ基盤、同意UI、データ保持・削除API、レスポンスヘッダー方針等：11件）、(C) 計画の回数上限またはスコープ網羅の制約による部分完了（7件）に分類し、[POST_RESUME_2.md](android-dynamic/POST_RESUME_2.md) と [CASE_MATRIX.md](review/CASE_MATRIX.md) に反映した。
- **停止・クリーンアップ確認**:
  - 端末でログアウトを実行し、[最終保存状態](android-dynamic/resume2-logged-out-storage.json) で `sessionRows: 0` / `configRows: 0` / `outboxEntries: 0`、SQLiteおよびSharedPreferencesのトークンマーカー不在を確認。`GET_USAGE_STATS` を `default`、カメラ・通知権限を取り消し、アプリ・ローカルAPI・Metroをすべて停止済み。

