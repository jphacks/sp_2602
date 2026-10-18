# 第2回再開後の追加検査（QR・通知・複数記録再送・残項目整理）

実施日: 2026-10-18。対象: `security/android-security-test-plan` / `0ddfc7e` の隔離コピー（`tmp/android-security-build`）、専用AVD `SlopeVerify`（`emulator-5556`、Android 17 / API 37）、ローカルAPI（`127.0.0.1:4313` および独立検証 `4316`、メモリPGlite、`MOCK=1`）。

## 1. QR連携の取消・再発行・ログアウト後の挙動と画面属性（PII-06 / PII-09 / AND-07）

### 端末上のQR発行・取消・Window属性
- 未連携の合成ユーザーでログインし、「子どもとして使う」からQR表示画面（`/pair/child`）へ遷移。`POST /api/pair/start` **200** と3秒間隔の `POST /api/pair/status` **200** を `http-metadata.jsonl` で確認。
- QR秘密を証跡へ残さないため、QR表示中はスクリーンショットを保存せず、`dumpsys activity top` と `dumpsys window windows` で描画構造・Window属性を確認した。
  - QR自体は `com.horcrux.svg.SvgView` として描画され、Accessibility node（`uiautomator dump`）の `text` / `content-desc` に40文字の16進QRコード平文は露出していなかった。
  - 一方、`MainActivity` の `Window#8` の flags は `fl=KEEP_SCREEN_ON LAYOUT_IN_SCREEN ...` であり、**`FLAG_SECURE` は設定されていなかった**。そのため、QR表示中にRecents表示やスクリーンショット撮影を行うと画像自体は取得可能である。
- QR画面下部の「やめる」をタップすると、即座に `POST /api/pair/cancel` **200** が送信され、役割選択画面（`qr-after-cancel.xml`）へ戻ることを確認した。

### 取消・再発行・ログアウト後の古いQR検証（`api-followup/qr-lifecycle.mts`）
1.1秒以上の間隔を守り計17リクエストで [qr-lifecycle-evidence.json](../api-followup/qr-lifecycle-evidence.json) を採取した（トークン・QRコード平文は保存していない）。

- **取消後の再利用拒否**: `pairCancel` 実行後、チケット状態は `expired` になり、直後に親が古いコードで `pairClaim` を呼ぶと **`409 conflict`** で拒否された。
- **再発行（waiting状態）後の古いQR拒否**: QR #2 発行後に QR #3 を再発行すると、QR #2 は自動的に `state: "expired"` となり、親が古い QR #2 のコードで `pairClaim` を呼ぶと **`409 conflict`** で拒否された。
- **再発行（claimed状態）後の確定拒否**: 親が QR #3 を `pairClaim`（`200`, `state: "claimed"`）した後、子が確定前に QR #4 を再発行すると、古い `pairId` (#3) に対する `pairConfirm` は **`409 conflict`** で拒否された。
- **取消なしの直接ログアウト時の観測**:
  - 端末UI上は、QR表示画面にログアウトボタンはなく、「やめる」または戻る操作で必ず `pairCancel` が呼ばれる設計になっている。
  - ただしサーバー実装（`src/server/auth.ts` の `signOut`）単体では、`authSignOut` は `userSessions` のみを失効させ、`pairTickets` は失効させない（`unlinkChild` や `startPair` では `pairTickets` も `expired` に更新している）。そのため、通信断等で `pairCancel` が届かないままログアウトした場合、10分の有効期限内は親の `pairClaim` が `200 (claimed)` になり得る。もっとも、子のセッションが失効しているため `pairConfirm` は **`401 unauthorized`** で拒否され、家族リンクが成立することはない。
- **判定**: PII-09 の「QR秘密を再取得・再利用できず、再発行時に古い未使用tokenも仕様どおり無効化される」は、API・端末UIの取消／再発行／期限／1回使用で **PASS**（取消なし直接 `signOut` 時に10分間 `claim` のみ通る点は、確定不可な軽微な設計観測として併記）。カメラ実画像による光学読取自体はエミュレーター制約のため未実施（カメラ権限・スキャナ起動と `pairClaim` APIは個別に確認済み）。

## 2. 通知・ロック画面・Logcat・Recents要件整理（AND-06 / AND-07 / PII-04 / PII-06）

### ネイティブ通知・ロック画面設定の実機確認
- 合成の子アカウントでログインし、`GET_USAGE_STATS` と `POST_NOTIFICATIONS` を許可した状態で `MonitorService` のForeground通知を `dumpsys notification --noredact` で検査した。
- **通知内容**:
  - Channel: `slope_engine`（`mImportance=2` / `IMPORTANCE_LOW`）
  - Title: `Slope が使用時間を見守っています`
  - Text: `今日は 3% 使いました`
  - 生の利用分数、個別アプリ名、Bearerトークン、QR秘密、内部UUIDは通知に含まれず、仕様（MVP_SPEC 4.2）どおり割合のみであることを確認した。
- **ロック画面可視性**:
  - `vis=0`（`VISIBILITY_PRIVATE` 相当の既定値）、`publicNotification=None`、`mLockscreenVisibility=-1000`。
  - 通知文自体に機微な生データを含めない設計になっているため、ロック画面で通知文が見えても利用履歴詳細や秘密情報は漏えいしない。

### QR・通知・再送操作後のLogcat検査
- QR発行・取消、子ログイン、通知表示、複数アウトボックス同期を実行した後のアプリPID（`5133`）のLogcat直近4,000行を走査（[logcat-qr-outbox-probe.json](logcat-qr-outbox-probe.json)）。
- `mock-token-`（0件）、`Bearer ...`（0件）、QR 40文字16進コード／`pairClaim`（0件）、`FATAL EXCEPTION`（0件）を確認した。

### Recentsで隠すべき画面の要件整理（AND-07 / PII-06）
- 現状、アプリ全体で `FLAG_SECURE`（または `expo-screen-capture` 等による画面保護）は設定されていない。
- 画面別の露出影響と要件整理:
  1. **子QR表示画面（`/pair/child`）**: 10分間有効な一時ペアリングコードがQRとして表示される。「やめる」・戻る・再発行で即時無効化されるが、表示中のスクリーンショットやRecentsサムネイルからの意図しない読み取りを防ぐには、当該画面（またはペアリング遷移中）での `FLAG_SECURE` 適用が望ましい。
  2. **親の利用詳細・ホーム画面（`/parent/home`, `/parent/app-usage`）**: 子の利用分数・上限・アプリ別利用時間・権限状態がRecentsプレビューに残る（ログアウト時はログイン画面で上書きされることを前回確認済み）。家庭内端末の共有有無に応じて、保護画面に `FLAG_SECURE` をかけるか要件決定が必要。
  3. **子ホーム・通知**: 割合（`3%`）と次のテスト名のみの表示であり、生分数やトークンは含まれない。

## 3. 複数失敗記録の再送・重複送信・成功分のみの解除（AVL-03 / NET-04 / NET-05）

- 専用AVDの `catalystLocalStorage`（`slope.usage-outbox`）に、スキーマに適合する次の3件を格納してアプリを起動し、ローカルAPI（`127.0.0.1:4313`）への自動flushを検証した（[multi-outbox-evidence.json](multi-outbox-evidence.json)）：
  1. `11111111-2222-4333-8444-555555555501`: `2026-10-17` の利用記録（`state: "pending"`, `attempts: 1`, `errorCode: "network"`）
  2. `11111111-2222-4333-8444-555555555502`: `2026-10-18` の利用記録（`state: "pending"`, `attempts: 2`, `errorCode: "network"`）
  3. `11111111-2222-4333-8444-555555555503`: 別の子IDを指定した不正記録（`state: "pending"`, `attempts: 0`）
- **初回flushの結果**:
  - `http-metadata.jsonl`（348〜351行）で `/api/usage/upload` が **200, 200, 403**（＋当日測定分の200）と記録された。
  - 正常な 1・2 の2件は送信待ちから消去され、恒久エラー（`403 forbidden`）となった 3 の1件だけが `state: "quarantined"`, `attempts: 1`, `errorCode: "forbidden"` として隔離保持された（他の正常記録の同期を妨げないことを確認）。
- **重複送信（同一 `submissionId` 再送）のflush結果**:
  - すでにサーバーで受理された 1（`...5501`）を再度 `pending` として送信待ちへ戻し（計2件：`5501` pending ＋ `5503` quarantined）、再度アプリを起動してflushさせた。
  - `5501` はサーバー側で `duplicate`（HTTP 200）として冪等処理されて送信待ちから消去され、隔離済みの `5503` は再送されず（HTTP 403が再発せず）そのまま `quarantined` に留まった。
- **判定**: **NET-04**（実機からの同一 `submissionId` 再送による二重保存防止・送信待ち解除）および **AVL-03**（複数失敗データの再送・バックオフ・冪等性・恒久エラー隔離による無限リトライ回避）を **PASS** へ更新する。

## 4. Release APK固有の検査と未完了項目の分類整理

### Release APK固有の検査（NET-01 / NET-02 / AND-01）の現状と前提整理
- `android/app/build.gradle` は `SLOPE_UPLOAD_STORE_FILE` 等の4設定がない場合、`slopeCheckReleaseSigning` タスクで release ビルドを停止し、debug 鍵へフォールバックしない設計（これ自体は安全な構成であり `tests/plugins/release-signing.test.ts` で検証済み）。
- 先行検査で署名確認タスクのみを除外して生成した **release merged Manifest**（[release-manifest/REPORT.md](../release-manifest/REPORT.md)）では、debug用の3 Activityと `usesCleartextTraffic="true"` / `debuggable="true"` が除去され、targetSdk 36 の既定（平文HTTP禁止・システムCAのみ信頼）となることを静的に確認済み。
- ただし、本検査の安全条件（「生成した一時鍵は製品・release署名に使わない」「ソース・ビルド設定を変更しない」）のもとでは、本番・配布用の署名鍵およびHTTPS接続先（`EXPO_PUBLIC_API_URL=https://...`）が未提供のため、**署名済みrelease APKの実機インストールによる動的通信検査（HTTP拒否・不正証明書プロキシ拒否）は「前提不足（リリース用鍵・HTTPS検査環境の提供待ち）」** として `BLOCKED` を維持する。

### 残りの未完了（BLOCKED）項目の3分類整理

全76項目のうち、今回の追加検査で **PII-09, NET-04, AVL-03 の3件が PASS** となり、現在の内訳は **PASS 28 / FAIL 7 / BLOCKED 36 / 条件付きN/A 5**。残る `BLOCKED` 36項目は次の3区分に整理される。

1. **要件・仕様判断待ち（6項目）**
   - **AND-07 / PII-06**: Recentsプレビュー（親画面の利用履歴・子QR画面）に対する `FLAG_SECURE` 等の画面保護要件の決定待ち（通知文に機微情報が出ないこと、QR取消・再発行のサーバー無効化は確認済み）。
   - **IN-06**: `packageName` に制御文字を含む入力が現在 200 で受理される仕様の許容可否判断待ち。
   - **IN-10**: 日付境界27単体テストは通過済み。計画書で「未承認ルールはBLOCKED」とされている例外計算ルールの確定待ち。
   - **PII-10 / IPA-15**: `unlinkChild` 時に過去の設定・利用記録・アプリ一覧をDBに残す現行仕様（`src/server/auth.ts:510` の `TODO(未決)`）の保持・削除ポリシー確定待ち。
2. **環境・前提不足（Release署名鍵・実OAuth・TLSプロキシ・累積回数上限）（11項目）**
   - **NET-01 / NET-02 / NET-03**: 署名済み release APK・HTTPS接続先・エミュレーター用TLSプロキシ（CA証明書導入と削除）が必要。
   - **AND-01 / AND-12**: debug APK走査・release merged Manifest確認まで完了。署名済み release APK 成果物に対する最終確認待ち。
   - **IPA-14**: 実OAuth（Google Web Client ID / 認可コールバック）設定が必要（ローカル `MOCK=1` ではOAuthコールバック検証対象外）。
   - **IN-05 / AVL-01**: 先行実行で計画の1ケース20回上限に達したため、安全規則に従い追加送信を停止済み（実施済みスライスは合格）。
   - **API-12**: エラー本文・サイズの一致は確認済み。統計的なタイミング差検証は回数制限（20回上限）の制約により対象外。
   - **IN-09 / NET-06**: 版競合・遅延応答は単体テスト（`config-cache.test.ts`, `security.test.ts`）で通過済み。実機上の人工的な通信順序逆転プロキシのみ未実施。
3. **網羅範囲の部分完了（主要経路は確認済み、全エンドポイント・全画面・長時間耐久が未完）（19項目）**
   - **PII-01 / PII-02 / PII-03 / PII-08 / IPA-02**: 家族一覧・設定・利用履歴の主要IDOR拒否とDTO構造は確認済み。残り全34経路のレスポンス比較・全画面突合。
   - **PII-04 / PII-07 / IN-12 / NET-08 / AND-06**: サンプルエラー応答の汎用性と操作後Logcat 4,000行の秘密非露出は確認済み。全異常系・サーバー標準エラー出力の抑制整理。
   - **IPA-04 / IPA-05**: 代表的なSQL風文字列・HTML風文字列の保存と一覧・編集画面でのエスケープ表示は確認済み。他入力欄の網羅。
   - **AND-02 / IPA-10**: `MainActivity` への不正URI・偽role・16KiB extraの拒否と非公開Service/Provider拒否は確認済み。残りexported Receiver類への直接送信。
   - **AND-09 / AND-10**: 使用状況アクセス・カメラ・通知権限の挙動は確認済み。オーバーレイ・電池最適化・ユーザー補助の個別動的確認。
   - **AND-11 / AND-14 / AVL-05**: タイムゾーン変更・通常再起動・バックグラウンド復帰は確認済み。システム時刻の大幅変更や長時間反復耐久は未実施。

## 5. 停止・後片付け状態

- 合成の子アカウントをUIからログアウトし、`resume2-logged-out-storage.json` で **`sessionRows: 0`, `configRows: 0`, `outboxEntries: 0`、SQLiteおよび全SharedPreferencesのトークンマーカー `false`** を確認。
- `GET_USAGE_STATS` を `default` に戻し、`POST_NOTIFICATIONS` を `revoke` し、`com.quedotcom.androidslope` を `force-stop` 済み。
- ローカルAPI（4313）および Metro（8081）のバックグラウンドプロセスを停止済み。
- アプリ本体・依存関係・作業ブランチのコードは一切変更していない。

