# Slope Android / API セキュリティテスト結果

実施日: 2026-10-18（JST）  
計画書: [`ANDROID_SECURITY_TEST_PLAN.md`](ANDROID_SECURITY_TEST_PLAN.md)  
判定の書き方は計画書 4章どおり `PASS`（期待どおり拒否・保護）／`FAIL`（越権・漏えい・クラッシュ等を再現）／`BLOCKED`（未実装・未検査）。対象外は `N/A`。

## 0. まとめ

| 区分 | 件数 |
|---|---|
| PASS | 52 |
| FAIL | 9 |
| BLOCKED | 11 |
| N/A | 4 |

認証・認可（他の家庭のデータの読み書き、子どもによる保護者操作、ID の差し替え、QR の再利用・期限・同時読み取り）は、試したすべての経路でサーバが拒否しました。個人情報の漏えいにつながる越権は見つかっていません。

一方で、次の FAIL があります（重い順）。

| # | 重要度 | ケース | 内容 |
|---|---|---|---|
| F-1 | **高（P0）** | PII-05, AND-05 | ログインの合言葉（session token）を端末に平文で保存している。AsyncStorage（`databases/RKStorage`）と、子どもの端末では SharedPreferences（`slope_engine.xml` の `report_token`）にも。Android Keystore を使っていない |
| F-2 | **高** | PII-10 | 保護者が子どもとの連携を外したあと、その子どもが**別の保護者**と連携し直すと、新しい保護者に**前の家庭の時期の利用記録とテスト日程**が見える |
| F-3 | 中 | IN-06, IPA-12 | 対象外アプリの `packageName` に NUL 文字（`\u0000`）を入れると **500**（DB のエンコードエラー）。4xx で拒否すべき入力 |
| F-4 | 中 | IN-12 | 上の 500 のとき、サーバのエラーログに**利用者の入力がそのまま**（改行込み）出る。入力の `\r\nX-Injected: 1` がログの別の行として現れる（ログの偽装）。利用者 ID もログに出る |
| F-5 | 中 | AVL-01 | ログイン（`authGoogle`）と QR の発行（`pairStart`）にレート制限がない（各 20 回・1 秒に 1 回で全部 200）。QR の番号の送信（`pairClaim`）は 10 回失敗で 429 になり、制限が効いている |
| F-6 | 低 | IN-04 | テスト期間・空白期間の日付に、西暦 0001 年や 9999 年を入れても保存できる |
| F-7 | 低 | IPA-15 | 連携を外す（`familyUnlink`）操作に監査記録がない（画面にはまだ入口がなく、API だけ） |

計画書のケースには当たらないが、テスト中に見つけた不具合:

| # | 重要度 | 内容 |
|---|---|---|
| X-1 | 中（安定性） | 空白期間だけが登録された子どもでは、`configGet` を**読むたびに** `configVersion` が 1 ずつ増える（読むだけで状態が変わる）。原因は `getConfigForCaller` が毎回 `topUpDailyLimits` を呼び、空白期間だけでは日別上限がしきい値に届かないため、毎回 `version + 1` を書いているため（`src/server/services/config-snapshot.ts:22`、`backend/src/db/c10-recalculate.ts:148`）。親が保存するときの `expectedVersion` がすぐ古くなり conflict になりやすい・子どもの端末が「反映待ち」から抜けにくい、などが起きうる |

## 1. 環境と前提

| 項目 | 値 |
|---|---|
| ブランチ / コミット | `security/android-security-test-plan` / `0ddfc7e`（基点 `main` の `9883d2b`） |
| AVD / serial | `SlopeVerify`（Pixel 8）/ `emulator-5556` |
| Android | Android 16 / API 36（google_apis_playstore x86_64）、AVD RAM 2048 MB |
| APK | debug（dev client）`app-debug.apk`、x86_64、versionName 1.0.0 / versionCode 1 |
| APK SHA-256 | `8FB1DA428DCFBFBF42439DEEFBDA8C00D002B41BD96AB41A039820DE0030C885` |
| release の確認 | release の APK は作っていない。release のマニフェストだけを、テスト専用の使い捨ての鍵（配らない・2日で失効）で `processReleaseMainManifest` まで生成して確認した |
| サーバ | `src/server/app.ts` を **127.0.0.1:3000 だけ**で待ち受ける起動スクリプトで起動（`npm run dev:server` は 0.0.0.0 で待つため。リポジトリのファイルは変えていない）。`MOCK=1`、DB は使い捨ての PGlite（`state/pglite` とは別のフォルダ） |
| 接続先 | エミュレータ → `adb reverse tcp:3000` → `http://localhost:3000`（**ローカルのみ確認済み**）。Metro も localhost だけ（`--localhost` + 127.0.0.1 のみの中継） |
| アカウント | MOCK のデモの保護者・子ども（家庭A）と、テスト用に作った「はじめての人」同士を QR で連携した家庭 B・C・D（すべて架空。実アカウント・実データなし） |
| 送信のペース | 機能の確認は 0.25 秒以上の間隔。濫用耐性（AVL-01）は 1 秒に 1 回・各ケース 20 回まで |
| 秘密情報 | token・QR の番号は記録していない（スクリプトは伏せ字にして出力。端末の保存は「ある／ない」の件数だけを見た） |

使った手順（再実行できるように残したもの。セッションの作業フォルダにあり、リポジトリには入れていない）: API の自動テスト2本（`api-tests.mjs`・`api-tests-part2.mjs`）、ローカル限定の起動スクリプト、エミュレータ操作の補助。必要ならリポジトリの `SECURITY_TEST/` に入れます。

補助の証拠として、リポジトリの既存テストのうち関係する 9 ファイル（`tests/lib/usage-outbox`・`config-cache`・`sign-out`、`tests/verify/security`・`revoke-and-limit`・`c3-c7-c8`、`tests/server/body-limit`・`usage-clock`・`auth-pair-persistence`）を実行し、**104 件すべて成功**した。これは BLOCKED の判定を PASS に変える根拠には使っていない（計画書 7章: 実施していないものは PASS にしない）。

## 2. FAIL の詳細

### F-1 合言葉の平文保存（PII-05 / AND-05）

- 手順: デモの保護者でログイン → `run-as com.quedotcom.androidslope` で `databases/RKStorage` を端末の中で検索。次に子どもでログインし、`shared_prefs/slope_engine.xml` も検索（端末の外へは写していない）。
- 実結果:
  - 保護者: `RKStorage` の `slope.session` に token が平文で1件ある。
  - 子ども: `RKStorage` に1件、`slope_engine.xml` の `report_token` に1件（あわせて `report_url`・`report_child_id`）。
  - ログアウト後: 保護者・子どもとも、両方の場所から token が消えた（0件）。ここは期待どおり。
- 緩和されている点: アプリ専用の領域（他のアプリから読めない）、`allowBackup=false`、`dataExtractionRules` でクラウドのバックアップ・端末間の引き継ぎから全部の置き場を除外（release のマニフェストで確認）。
- 残るリスク: root 化した端末・端末の解析・debug 版（`run-as` で読める）で token が取り出せる。token は最後に使ってから 30 日有効。
- 該当箇所: `src/lib/storage.ts:18`（AsyncStorage）・`:22`（`slope.session`）、`modules/kit-native/android/src/main/java/dev/hackathon/kit/kitnative/engine/EngineStore.kt:36`・`:163`（`report_token`）。
- 対策の案: token だけを Keystore で守られた保存方式（例: `expo-secure-store`、Kotlin 側は `EncryptedSharedPreferences` か Keystore の鍵で暗号化）へ移す。

### F-2 連携を外したあとの、前の家庭のデータの見え方（PII-10）

- 手順: 子C が保護者C1 と連携 → 子C が利用記録を送る・C1 がテスト期間を作る → C1 が `familyUnlink` → 子C が別の保護者C2 と QR で連携 → C2 が `usageGet`・`testPeriodList` を読む。
- 実結果: C2 に、C1 と連携していた時期の利用記録（`COldHistoryApp`）と、C1 が作ったテスト期間（「旧保護者が作ったテスト」）が返った。連携を外した時点で子どもの古い token は 401 になり、ここは期待どおり。
- 該当箇所: `src/server/auth.ts:510-512` に TODO として既知（「別の保護者と紐づけ直すと、その保護者に前の利用記録・端末のアプリ一覧とアイコンが見える」）。
- 対策の案: 連携を外すときに、子どもの利用記録・設定・アプリ一覧を消す。または「どの保護者との連携の間のデータか」を持ち、新しい保護者には連携した後のデータだけを返す。

### F-3 NUL 文字で 500（IN-06 / IPA-12）

- 手順: 保護者A が `excludedAppsSave` に `packageName: "com.evil\u0000\r\nX-Injected: 1"` を送る。
- 実結果: HTTP 500 `{"code":"internal","message":"うまく処理できませんでした",...}`。クライアントへの応答に SQL やスタックは出ていない（NET-08 は PASS）。
- 原因: `PackageName = z.string().min(1).max(255)` に文字の種類の制限がなく、DB が `invalid byte sequence for encoding "UTF8": 0x00` で拒否する（`contracts/schemas.ts:36`）。
- 対策の案: `PackageName` を Android のパッケージ名の形（英数字・`.`・`_`）に限る。ほかの自由入力の文字列でも NUL・制御文字を Zod で拒否する。

### F-4 エラーログへの入力のそのままの出力（IN-12）

- 手順: F-3 と同じ。
- 実結果: サーバの標準エラー出力に `[internal] DrizzleQueryError: Failed query: ... params: false,<保護者の uuid>,...,com.evil<NUL><CR>` が出て、次の行に `X-Injected: 1` が単独の行として出た（ログの行の偽装）。利用者 ID（uuid）と入力値もログに残る。token・QR の番号・Authorization はログに**出ていない**（サーバのログ全体を検索して 0 件）。正常に処理したときは入力をログに出さない（CRLF を含む名前を保存しても、ログには何も出ない）。
- 該当箇所: `src/server/errors.ts:38`（`console.error("[internal]", e)`）。
- 対策の案: エラーをログに出すときは、エラーの種類と相関 ID だけを出し、`params` は出さない（許可した項目だけを出す方式。計画書 2.1 の P0）。

### F-5 ログイン・QR の発行のレート制限がない（AVL-01）

- 実結果: `pairClaim` を誤った番号で 12 回 → 11 回目から 429（制限あり）。`pairStart` を 20 回 → すべて 200。`authGoogle` を 20 回 → すべて 200。
- 影響: 本番の Google ログインは Google 側の検証を通るが、サーバ側に回数の制御がない。`pairStart` は1回ごとに DB へ行を書く。
- 対策の案: 人ごと・IP ごとの控えめな上限（例: 1分に数回）を入れ、429 を返す。

### F-6 極端な日付を受け付ける（IN-04）

- 実結果: 存在しない日（2/30）・形の違い（`2026/10/20`）・開始日 > 終了日は 400。西暦 0001 年・9999 年のテスト期間は 200 で保存された。計画の開始日を過去にすると 400（ここは期待どおり）。
- 対策の案: テスト期間・空白期間の日付に「今日から ±数年」などの範囲を設ける。

### F-7 連携を外す操作の監査記録（IPA-15）

- 実結果: 権限の検査は期待どおり（他の家庭の子どもを外そうとすると 403、自分の子どもだけ外せる）。ただし、外した記録（誰が・いつ・どの子どもを）を残す仕組みがない。アプリの画面には入口がまだなく、API だけがある。
- 対策の案: 画面に入れるときは、確認のダイアログと、外した記録（監査ログ）を一緒に作る。外したあとの復旧手順（もう一度 QR で連携）を案内する。

## 3. ケースごとの結果

### A. 認証・認可・API 列挙

| ID | 判定 | 実結果 |
|---|---|---|
| API-01 | PASS | 保護対象の 34 本すべてが、合言葉なしで 401。本文は `{code,message,hint}` だけで、個人データ・内部情報なし |
| API-02 | PASS | 空・空白・でたらめ・43 文字の乱数・5000 文字・SQL 風・`Basic` 方式・方式なしの合言葉、**ログアウトで無効にした合言葉**、すべて 401。応答に合言葉もスタックもない |
| API-03 | PASS | 子どもの合言葉で保護者専用の 10 本（計画・通常上限・対象外アプリ・Web サイト・空白期間・連携を外す・利用実績・アプリ一覧・端末の状態・家族一覧）が 403。設定の版は変わらない（4 → 4） |
| API-04 | PASS | 保護者A が子B を指定した読み取り 10 本がすべて 403。本文に B のデータなし |
| API-05 | PASS | 保護者A が子B を指定した書き込み 10 本（連携を外すを含む）がすべて 403。B は連携したまま。※ この確認中に B の版が 3 → 4 に上がったが、原因は A ではなく、B の保護者自身の `configGet`（X-1）であることを別に確かめた |
| API-06 | PASS | 子A の合言葉で `childId` を子B にした送信（利用記録・端末の状態・アプリ一覧・テスト期間・設定）がすべて 403。B に偽の記録は入っていない |
| API-07 | PASS | 本文に `role`・`isAdmin`・`parentId`・`ownerId`・`createdByUserId`・入れ子の `owner{}` を足しても無視される。テスト期間の作成者は呼んだ本人、役割は変わらない |
| API-08 | PASS | `GET /api/health` は `{"ok":true,"mock":true}` だけ（環境変数・SQL なし）。未知のパス（`/`・`/admin`・`/.env`・`%2e%2e` を含むパス・`/state/pglite`）とメソッド違いは 404 の JSON。※ `backend/src/server.ts`（Docker の DB つき health）は今回起動していない |
| API-09 | PASS | 出し直した後の古い QR・取り消した QR・使用済みの QR（同じ人・別の人）がすべて 409。**10 分 15 秒待った QR も 409**「期限が切れています」、状態は `expired` |
| API-10 | PASS | 関係ない人は QR の状態を読めない（404）。読み取った保護者も確定できない（403）。QR を出した子ども本人だけが確定できた |
| API-11 | PASS | 連携の確定を送り直すと 409、保護者の子どもは1人のまま（二重の連携なし） |
| API-12 | PASS | 保護者A が「別の家庭の子ども」「存在しない uuid」「uuid でない文字列」「別の家庭の保護者の ID」を指定 → すべて同じ 403 の本文・同じ大きさ（80 バイト）、時間の中央値 22〜25ms で差なし。QR の状態も「実在するが関係ない」と「存在しない」が同じ 404 |

### B. 入力検証・業務ルール・DB 境界

| ID | 判定 | 実結果 |
|---|---|---|
| IN-01 | PASS | `test' OR '1'='1`・`test');--`・`";-- DROP TABLE users;` は文字列としてそのまま保存。件数は +3 だけ、別の家庭は変化なし、SQL のエラーなし |
| IN-02 | PASS | `<script>`・`<img onerror>` はサーバに文字列で保存され、アプリの画面（親05）でも文字として表示された（実行されない。IPA-05） |
| IN-03 | PASS | 名前: 空・空白だけ・121 文字は 400、120 文字と絵文字（結合文字つき）は 200 で、読み戻しても同じ |
| IN-04 | **FAIL** | F-6 |
| IN-05 | PASS | 通常上限: 負・小数・1441・巨大な数・文字列・null・配列は 400、0 は 200。利用記録の分数が負なら 400 |
| IN-06 | **FAIL** | 長さ 256 と空白だけは 400。NUL・改行を含む `packageName` は **500**（F-3） |
| IN-07 | PASS | API-07 と同じ（未知の項目は Zod が捨てる） |
| IN-08 | PASS | 同じ送信 ID・同じ中身 → `accepted` の次は `duplicate`。同じ ID で中身だけ違う → 409 |
| IN-09 | PASS | 古い版・未来の版の `expectedVersion` で保存 → どちらも 409 |
| IN-10 | PASS | G > S は 400、開始日=今日・S=G=0 は 200、同じ日のテスト期間は 200。その後の `configGet` は 200 で、負の日別上限はない。※ 業務ルールそのものの正しさ（C10 の計算）は対象外 |
| IN-11 | PASS | 9 MiB の本文は読む前に 400「送る内容が大きすぎます」、サーバは動いたまま。上限は `/api/*` 全体で 8 MiB（計画書の例の 64 KiB より大きい。`usageUpload` の最大に合わせた値。`src/server/app.ts`） |
| IN-12 | **FAIL** | F-4 |

### C. 通信・セッション・キャッシュ

| ID | 判定 | 実結果 |
|---|---|---|
| NET-01 | PASS | release のマニフェストに `usesCleartextTraffic` も `networkSecurityConfig` もない（targetSdk 36 の既定 = 平文の HTTP は不可）。`usesCleartextTraffic="true"` は `android/app/src/debug`・`debugOptimized` だけ |
| NET-02 | BLOCKED | 無効な証明書の HTTPS プロキシと、HTTPS のローカルサーバを用意していない。静的には、release に独自の信頼設定がなく、利用者が入れた CA は信頼されない（API 24 以降の既定） |
| NET-03 | BLOCKED | debug プロキシでの通信の観察はしていない。合言葉は `Authorization: Bearer` で送り、URL・ログ・画面には出ないことを別のケースで確認した（AND-06・PII-06） |
| NET-04 | PASS | 同じ利用記録の POST を送り直すと `duplicate`（二重に数えない）。サーバ側の確認 |
| NET-05 | BLOCKED | 機内モードでの確認はしていない（`adb reverse` 経由のため、機内モードでもローカルの通信が切れない）。既存テスト「通信の失敗は送信待ちのまま、同じ送信 ID で、間をあけて送り直す」などは成功 |
| NET-06 | BLOCKED | 遅れて届く古い応答を実際には作っていない。既存テスト「遅れて届いた古い応答は、待っている間に保存された新しい組を上書きしない」などは成功 |
| NET-07 | PASS | ログアウト後、戻るボタンでもアプリの再起動でもログイン画面。古い合言葉はサーバで 401（API-02） |
| NET-08 | PASS | 不正な ID・存在しない記録・範囲の誤り・でたらめの合言葉・本文の型の誤りは、すべて `{code,message,hint[,issues]}` で、SQL・パス・スタックなし。NUL の 500 も一般的な文言だけ（ログ側の問題は F-4） |

### D. Android アプリ・ローカルデータ・OS 連携

| ID | 判定 | 実結果 |
|---|---|---|
| AND-01 | PASS | release で外から呼べる部品: `MainActivity`（`slope://`）、ウィジェット（`SlopeWidget`）、Device Owner の受け手（`BIND_DEVICE_ADMIN` で保護）、解除の受け手（`DUMP` で保護）、再起動の受け手 2 つ（権限なし。下の注）、Google のサービス（専用の権限で保護）、`ProfileInstallReceiver`（`DUMP`）。dev launcher・`PreviewActivity` は debug だけ。ContentProvider 3 つはすべて `exported=false` |
| AND-02 | PASS | `MainActivity` に 2 万文字の extra・型の違う extra・データなしの VIEW を送ってもクラッシュなし、ログイン画面のまま。再起動の受け手は `BOOT_COMPLETED` を外から送ると SecurityException（OS だけが送れる放送）、ほかの action は何もしない。ウィジェットの独自 action は描き直すだけ |
| AND-03 | PASS | ログアウト中に `slope:///parent/home`・`/child/home`・`/parent/settings`・`/pair/status?pairId=…&accept=true`・`/pair/usual-limit`・`../../parent/plan` を開く → すべてログイン画面。知らないホストの `slope://evil.example.com/login?token=abc` は Expo Router の「Unmatched Route」画面（URL をそのまま表示する。アプリは URL に合言葉を入れないので実害なし） |
| AND-04 | PASS | 保護者でログアウト → 端末から合言葉と設定のキャッシュが消えた。同じ端末で子どもとしてログイン → 保護者の合言葉は残っておらず、子どもの画面だけ。子どもでログアウト → 子どもの合言葉も Kotlin 側の `report_token` も消えた |
| AND-05 | **FAIL** | F-1（バックアップは無効化済み。保存方式が平文） |
| AND-06 | PASS | 保護者・子どもでのログイン・画面表示の間の Logcat に、合言葉・`Authorization`・利用者の uuid・API のパス・利用分数は 0 件 |
| AND-07 | BLOCKED | 最近使ったアプリの画面に、保護者のホーム（子どもの今日の使用量・週のグラフ・テスト名）がそのまま写る（`FLAG_SECURE` なし）。保護者自身の端末の表示なので、守るかどうかは仕様の判断が必要（判断待ち）。通知のプレビューは、上限の通知を出していないので未確認 |
| AND-08 | PASS | アプリのコードにクリップボード・共有（Share）・ファイル出力の処理がない（静的確認） |
| AND-09 | PASS | 子どもの端末で「使用状況へのアクセス」を拒否 → 「使用状況へのアクセスを許可してください」と「設定を開く」を表示（0 分・成功扱いにしない）。許可 → 使用量（1%）を表示。取り消し → 再び案内に戻る。カメラの拒否は動的には未確認（コードには設定を開く導線あり。`src/app/pair/parent.tsx`） |
| AND-10 | PASS | 特別な権限（オーバーレイ・使用状況・全アプリの一覧・全画面の通知・電池の最適化の除外）は、上限の案内・使用時間の測定・Q15 のアプリ一覧の機能に対応している。注: ライブラリから `READ/WRITE_EXTERNAL_STORAGE`（API 32 以下だけ）が入っている。使っていなければ外せる。`QUERY_ALL_PACKAGES` は Google Play の審査で理由の説明が要る |
| AND-11 | BLOCKED | 日付・タイムゾーンの変更、再起動の後の確認はしていない。サーバ側の「未来の測定時刻」の既存テストは成功 |
| AND-12 | PASS | 本番の JS バンドル（`expo export`）とマニフェストに、DB の URL・秘密鍵・API キー・サーバのコードはない。注: MOCK のデモのログイン（`mock-google-parent` と、デモの固定の合言葉）がバンドルに入っている。これは公開リポジトリにもあり、`MOCK=1` でないサーバでは 401 になる（D-126）。本番の版では `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` を入れて MOCK のボタンを出さないこと |
| AND-13 | PASS | ContentProvider はすべて非公開。非公開の `MonitorService` を外から起動すると「not exported」で拒否 |
| AND-14 | BLOCKED | 通知のタップ・画面の回転の繰り返しは未実施。画面の入口は役割で分けて戻している（`src/app/parent/_layout.tsx`・`child/_layout.tsx`）。サーバは毎回合言葉と役割を確かめる（A の各ケース） |

### E. 可用性・濫用耐性

| ID | 判定 | 実結果 |
|---|---|---|
| AVL-01 | **FAIL** | F-5 |
| AVL-02 | PASS | 同じ QR を 2 人の保護者が同時に読む → 200 と 409、成功は 1 回だけ |
| AVL-03 | BLOCKED | 送信待ちを実際に積んでの確認はしていない。既存テスト（間をあけた送り直し・直らない失敗の隔離）は成功 |
| AVL-04 | BLOCKED | 手元の DB（PGlite）はサーバと同じプロセスの中で動くため、DB だけを止められない。`backend/src/server.ts` の Docker 版は今回起動していない |
| AVL-05 | BLOCKED | 長い時間の画面の行き来・前面と背面の繰り返しは未実施 |

### 個人情報（PII）

| ID | 判定 | 実結果 |
|---|---|---|
| PII-01 | PASS | 保護者A の読み取り 10 本の応答に、家庭B の ID・名前・利用記録は含まれない。合言葉を返すのは `authMe` だけ |
| PII-02 | PASS | 自分の `childId` と、**別の家庭のテスト期間・空白期間の ID** を組み合わせて更新・削除（保護者A・子A から 6 通り）→ すべて 404。家庭B の期間は変わらない |
| PII-03 | PASS | 応答は DB の行そのままではなく、契約（Zod）の形だけ。返る内部 ID は自分の家庭のものだけ（自分の ID・相手の ID・子どもの ID・期間の ID・`createdByUserId`・DB の epoch）。注: `testPeriodList` は作った人の uuid（保護者の ID）を子どもにも返す（家族の中なので低リスク） |
| PII-04 | PASS | Logcat（AND-06）と、サーバの通常のログに、合言葉・QR の番号・利用記録の詳細は出ない。※ 想定外のエラーのときは入力と利用者 ID がログに出る（F-4） |
| PII-05 | **FAIL** | F-1。ログアウト・別の人への切り替えでは前の人の合言葉・キャッシュが残らない（ここは期待どおり） |
| PII-06 | PASS | URL・deep link・Logcat・クリップボードに合言葉が出る経路はない。QR の番号は QR の画像に入るが、サーバで 10 分・1 回限り（API-09）。※ QR を出す画面と通知の動的な確認はしていない |
| PII-07 | PASS | エラー本文に SQL・スタック・環境変数・他人のデータなし。「連携していない」と「存在しない」で同じ 403（API-12）。DB が止まったときは BLOCKED（AVL-04） |
| PII-08 | PASS | 2 人の子ども（家庭B・C）に同じ表示名「同じ名前」を付けても、保護者B の利用実績には B の記録だけ |
| PII-09 | PASS | 出し直し・取り消し・使用済み・期限切れの QR は使えない。DB には番号の SHA-256 だけを保存（`src/server/auth.ts` の `digest(code)`）。状態を聞いても番号は返らない |
| PII-10 | **FAIL** | F-2 |

### IPA 由来のシナリオ

| ID | 判定 | 実結果 |
|---|---|---|
| IPA-01 | PASS | API-01・API-12 |
| IPA-02 | PASS | API-04〜07・PII-02 |
| IPA-03 | PASS | ログアウトした合言葉は次の呼び出しで 401。エラーに合言葉・署名の情報なし。端末は戻る・再起動でもログイン画面（NET-07） |
| IPA-04 | PASS | IN-01 |
| IPA-05 | PASS | IN-02。WebView で利用者の入力を表示する画面はない |
| IPA-06 | N/A | ファイルの書き出し・読み込みの機能がない（サーバに `readFile`/`writeFile` を使う API なし） |
| IPA-07 | N/A | 外部のプロセスを呼ぶコードがない（`child_process`・`exec`・`spawn` なし） |
| IPA-08 | N/A | 利用者の入力をヘッダーやリダイレクト先に使う処理がない |
| IPA-09 | N/A | Cookie を使わず、`Authorization: Bearer` だけ |
| IPA-10 | PASS | AND-01〜03・AND-13。外からの Intent・deep link だけでは、ログイン・役割・連携は変えられない |
| IPA-11 | BLOCKED | 依存の棚卸しの判断が必要。`npm audit --omit=dev`: アプリ側 28 件（high 21・moderate 7。ほとんどが Metro・Expo CLI・`node-forge`（コード署名の道具）・`braces`/`micromatch` などの作る・開発する道具の経由）、`backend/` は 0 件。lockfile あり。`npm ci` は依存のインストールスクリプトを実行しない設定（npm の allow-scripts）。リポジトリの追跡ファイルに秘密はない（`.env.example` の手元用の値だけ）。APK の実行時に入るものかどうかの切り分け（トリアージ）が要る |
| IPA-12 | **FAIL** | 型違い・境界・未知の項目は 4xx だが、NUL 文字で 500（F-3） |
| IPA-13 | PASS | ログアウト・別の人への切り替えで前の人のデータは表示されず、Logcat も問題なし。※ 保存方式は F-1 |
| IPA-14 | PASS | 知らないホスト・似た文字列の deep link ではログイン状態にならない。合言葉を URL・WebView・クリップボードに出す導線はない。本物の Google ログイン（OAuth の戻り先）は、Google の設定がない MOCK の環境なので未確認 |
| IPA-15 | **FAIL** | F-7（権限の検査は PASS、監査記録なし） |

## 4. BLOCKED を減らすために要るもの

| 必要なもの | 進められるケース |
|---|---|
| HTTPS のローカルサーバ（自己署名）と debug プロキシ | NET-02・NET-03 |
| release の APK（チームの鍵で作る）と、そこから届く HTTPS の検証用サーバ | NET-01 の実通信・AND-12 の APK 全体 |
| 送信待ち・遅い応答を作る仕組み（例: プロキシで遅延・遮断） | NET-05・NET-06・AVL-03 |
| `backend/` の Docker の DB（止められる DB） | AVL-04・PII-07 の DB 停止 |
| 日付・タイムゾーンの変更、長時間の操作 | AND-11・AND-14・AVL-05 |
| 仕様の判断 | AND-07（最近使ったアプリ・通知に利用状況を出してよいか）、IPA-11（依存の更新方針） |
| Google のテスト用の設定 | IPA-14 の OAuth の戻り先 |

## 5. 片付けと残したもの

- 端末: テスト用に変えた「使用状況へのアクセス」は既定に戻した。アプリは debug 版が入ったまま（データの消去・アンインストールはしていない）。
- リポジトリ: 生成物の `android/`（`.gitignore` 済み）と、手元用の `.env`（`.gitignore` 済み。`EXPO_PUBLIC_API_URL=http://localhost:3000`・`EXPO_PUBLIC_FAKE_USAGE=1`）を作った。追跡しているファイルは変えていない。
- Android SDK: native のビルドで Windows のパスの長さ（260 文字）の上限に当たったため、CMake 3.31.6（Ninja 1.12.1）を足し、`android/local.properties` で指定した。
- テスト用の使い捨ての鍵・PGlite のデータ・スクリプトは、セッションの作業フォルダにだけある。
