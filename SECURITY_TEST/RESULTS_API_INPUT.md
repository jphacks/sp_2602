# 結果: 入力・業務ルール・DB 境界ほか（サーバ側）

計画: [ANDROID_SECURITY_TEST_PLAN.md](ANDROID_SECURITY_TEST_PLAN.md)  
担当: B（IN-01〜12）、NET-04・NET-06・NET-08、AVL-01・AVL-02・AVL-04、IPA-04〜09・IPA-11・IPA-12・IPA-15、PII-10（サーバ側）  
実施日: 2026-10-18（ブランチ `security/android-security-test-plan`、基点 `0ddfc7e`）  
テスト: [`tests/security-plan/input.test.ts`](../tests/security-plan/input.test.ts)（31 件 PASS ＋ 「今は穴がある」印の `it.fails` 9 件）

## まとめの表

| ケース | 判定 | ひとことで |
|---|---|---|
| IN-01 | PASS | SQL の文字は文字列として保存。id の欄では他家庭の行を返さない |
| IN-02 | PASS | タグはそのままの文字列で返る。画面に HTML として描く所がない |
| IN-03 | **FAIL** | 長さ・空白・絵文字は正しく断る／通す。**NUL（\u0000）で 500** |
| IN-04 | **FAIL**（軽い） | 存在しない日・形違い・前後逆は 400。**0001 年・9999 年の期間を保存できる** |
| IN-05 | PASS | 負・小数・巨大・文字・null・配列は 400。0 分は有効。版の巨大な値も 500 にならない |
| IN-06 | **FAIL** | 長さ超え・空は 400。**利用記録の packageName が空白だけ／NUL で 500** |
| IN-07 | PASS | 余計な項目は捨てられ、役割・持ち主・版は変わらない |
| IN-08 | PASS | 同じ送信 ID の再送は duplicate、中身違いは 409（既存のテスト） |
| IN-09 | PASS | 組は1つの版でそろう。古い版の保存は 409。遅れた古い応答は端末が捨てる |
| IN-10 | PASS | 0 件・重複・同日・D=0・0 分上限は決めたとおり（既存のテスト） |
| IN-10（未決ルール） | BLOCKED | 終了日を含むか・丸め方・開始日より前の上限は「仮の既定」で計算中（人の判断待ち） |
| IN-11 | PASS | 8 MiB を超える本文は読む前に 400。その後も正常 |
| IN-12 | **FAIL** | ふつうの流れではログを出さない。**500 のときはログに SQL・入力の値・改行で作った偽の行が出る** |
| NET-04 | PASS | 再送は duplicate で行は増えない。期限切れは 401（再ログインの案内） |
| NET-06 | PASS | サーバは一貫した版を返す。端末は古い応答を捨てる（既存のテスト） |
| NET-08 | PASS | エラーの本文に SQL・パス・スタック・DB の名前が出ない |
| AVL-01 | **FAIL**（P2） | QR の番号の読み取りだけ 429 がある。**ログイン・QR を出す・利用記録の送信に回数の上限がない** |
| AVL-02 | PASS | 同じ QR を同時に読んでも成功は1人、つながりは1つ |
| AVL-04 | **FAIL**（軽い） | 通常の API は安全な 500 で、戻せば正常。**health が 503 でなく 500** |
| IPA-04 | PASS | IN-01 と同じテスト |
| IPA-05 | PASS | IN-02 と同じテスト（WebView なし） |
| IPA-06 | N/A | ファイル名を受け取る機能がない |
| IPA-07 | N/A | アプリ・サーバに外のプロセスを呼ぶ所がない |
| IPA-08 | N/A | 利用者の入力をヘッダーに使う所がない（補足のテストで確認） |
| IPA-09 | N/A | Cookie を使わない（Bearer だけ。補足のテストで確認） |
| IPA-11（npm） | PASS | 全部 registry.npmjs.org・integrity つき。インストール時のスクリプトは開発用だけ |
| IPA-11（Android・JVN 照合） | BLOCKED | Gradle のロックファイルがない（android/ は生成物）。JVN との照合はネットに出ないため未実施 |
| IPA-12 | **FAIL** | 20 件のファジングは全部 4xx。ただし IN-03・IN-06 の NUL・空白だけで 500（同じ原因） |
| IPA-15 | PASS | 他家庭・子どもからの外す・消す操作は拒否、範囲は自分の分だけ |
| IPA-15（監査・確認画面・復旧） | BLOCKED | 監査の記録の表がない。外す画面がまだない。バックアップの復元は手元で試せない |
| PII-10 | PASS | 外すと子どもの合言葉は 401、送信待ちを送り直しても復活しない |
| PII-10（外した後の残り） | BLOCKED | 利用記録・アプリ一覧は残り、**別の保護者と紐づけ直すと見える**。保持の仕様が未決（`src/server/auth.ts` の TODO） |
| PII-10（削除の機能） | BLOCKED | 利用記録の削除・アカウントの削除の API がない |

**件数: PASS 17 / FAIL 7 / BLOCKED 5 / N/A 4（33 行）**

### FAIL の中身（直す役への申し送り）

1. **NUL（`\u0000`）が入った文字列で 500**（IN-03・IN-06・IPA-12）。Postgres は文字列に NUL を保存できない（`invalid byte sequence for encoding "UTF8": 0x00`）。入口の Zod で断っていない。確かめた所: テスト期間の名前・空白期間の名前・QR の呼び名（pairStart）・対象外アプリの名前・利用記録のアプリ名と packageName・端末のアプリ一覧（childAppsUpload）、MOCK=1 のときの authGoogle（`mock-new-\u0000`。本番の Google の経路では jose が先に断る）。応答の本文は一般的な `internal` で、中身は漏れない。
2. **利用記録の packageName が空白だけで 500**（IN-06）。`AppMinutes.packageName` に「空白だけは不可」の検査がなく、DB の `usage_records_app_id_not_blank` に当たる（端末のアプリ一覧の `ChildApp` には同じ検査がある）。
3. **500 のときのログに SQL と入力の値がそのまま出る**（IN-12）。`src/server/errors.ts` の `console.error("[internal]", e)` が Drizzle の例外を丸ごと出すので、SQL の文・パラメータ（子どものアプリ名＝利用の詳細）・入力に入れた改行（偽のログの行）が Vercel のログに入る。合言葉そのものは出ない。
4. **回数の上限がない**（AVL-01）。authGoogle（MOCK のログインでは 20 回で 20 人の利用者ができる）・pairStart・usageUpload は 20 回続けてもすべて 200。usageUpload は中身の行は増えないが、送信 ID の行（usage_sync_batches）は送るたびに 1 行増える。
5. **0001 年・9999 年のテスト期間を保存できる**（IN-04。軽い）。日付は形と前後しか見ていない。500 にはならず、日別上限も壊れなかった。
6. **health が DB 停止時に 503 でなく 500**（AVL-04。軽い）。`src/server/handlers/health.ts` が普通の Error を投げるので internal になる（`backend/src/server.ts` の `/health` は 503）。

## 共通の条件

- 接続先: **プロセス内・PGlite・MOCK=1（ネットワークなし）**。サーバは `app.request`（Hono）で呼び、HTTP サーバは立てていない。Neon・Vercel・本番・Preview にはつないでいない。
- APK version / SHA-256: なし（サーバ側だけ。Android の実機・エミュレーターは使っていない）。Android API level / AVD: なし。
- テスト用アカウント: すべて MOCK のログインで作った架空の人（`mock-new-…`）。親A↔子A・親B↔子B を QR の紐づけで作る。デモの3人（固定の見本）も DB に入っている。
- 時計: `Date` だけを偽の時計にして 2026-10-15T03:00:00Z（日本時間 12:00）から始める。
- 送る回数: 1 つのテストで試しの要求は 20 回まで。8 MiB を超える本文は 1 回だけ。並列は AVL-02 の 2 本だけ。
- 実行: `npx vitest run tests/security-plan/input.test.ts --maxWorkers=2` → 31 passed / 9 expected fail。`npm run lint`・`npm run typecheck` も通る（下の「実行の記録」）。
- 秘密の値（合言葉・QR の番号）はこの記録に書いていない。
- 相関 ID: サーバに相関 ID の仕組みがないため、なし。証拠はテストの名前で示す。
- `it.fails` の 9 件は、いったん普通の `it` にして走らせ、すべて「期待した理由」で失敗すること（500・200・429 がない・ログに値が出る）を確かめた。

## 既存のテストとの対応表

| ケース | もう確かめているテスト（今回も走らせて通った） | 今回足したテスト（input.test.ts） |
|---|---|---|
| IN-01 / IPA-04 | なし | IN-01/IPA-04 の 2 件 |
| IN-02 / IPA-05 | なし | IN-02/IPA-05 の 2 件 |
| IN-03 | `tests/verify/decisions.test.ts`「テスト期間の契約: … 名前が空白だけは通らない」・`tests/server/api.test.ts`「件数・文字の長さの上限、空白だけの名前…」 | IN-03 の 3 件（うち it.fails 1） |
| IN-04 | `tests/verify/usage-growth.test.ts`「190日より前の日・明日より先の日…」・`decisions.test.ts`「サーバ: 開始日が今日なら通り、昨日なら 400」 | IN-04 の 4 件（うち it.fails 1） |
| IN-05 | `decisions.test.ts`「契約: 0 と 1440 は通る。-1・1441・小数…」 | IN-05 の 3 件 |
| IN-06 | `api.test.ts`（Q15 の上限・空白だけ） | IN-06 の 4 件（うち it.fails 2） |
| IN-07 | `tests/verify/security.test.ts`「テスト期間の更新で createdByRole・createdByUserId を送っても無視」「計画の保存で version・updatedAt・childId…」 | IN-07 の 1 件 |
| IN-08 | `security.test.ts`「同じ送信 ID の再送は何度でも duplicate」「日の並びやアプリの並びだけが違う再送は…」「ほかの子どもが同じ送信 ID を使っても conflict」・`usage-growth.test.ts`「置き換えられた前の送信を…」・`api.test.ts`「同じ送信 ID の送り直しは二重に保存しない」 | なし |
| IN-09 / NET-06 | `security.test.ts`「設定を変えるすべての API で、古い版・先の版は 409」「親と子が同じ版から同時に変えると…」・`tests/verify/c3-c7-c8.test.ts`「遅れて届いた古い版の応答は捨て（older_response）」・`tests/server/config-epoch.test.ts` | IN-09/NET-06 の 1 件 |
| IN-10 | `tests/verify/c10-hand.test.ts`（テスト 0 件・0 分・D=0・重なる期間は 400）・`tests/server/daily-limits.test.ts`（連続・同日・D=0・重なり）・`c3-c7-c8.test.ts`「上限 0 分: … 0 で割らない」 | なし |
| IN-11 | `tests/server/body-limit.test.ts`（上限+1・Content-Length・一番大きい正しい本文） | IN-11 の 1 件 |
| IN-12 | なし | IN-12 の 3 件（うち it.fails 1） |
| NET-04 | `c3-c7-c8.test.ts`「応答が消えた → 同じ送信 ID で送り直し、duplicate」「ログインが切れた（401）ときは…送信待ちのまま」・`api.test.ts`「30日使われなかった合言葉は無効」 | NET-04 の 1 件 |
| NET-08 | `security.test.ts`「壊れた JSON は 400 … SyntaxError を返さない」「合言葉がない・違うときは issues を返さない」・`api.test.ts`「想定外の例外は internal（中身は漏らさない）」・`tests/verify/google-token.test.ts`「エラーの本文に jose の例外の文を出さない」 | NET-08 の 1 件 |
| AVL-01 | `tests/verify/revoke-and-limit.test.ts`「10 回まちがえると … 429」「上限は人ごと」 | AVL-01 の 5 件（うち it.fails 3） |
| AVL-02 | `api.test.ts`「同じ QR を2回読む（二重読取）と、2回目は使用済みの conflict」（順番に送る） | AVL-02 の 1 件（同時に送る） |
| AVL-04 | なし | AVL-04 の 2 件（うち it.fails 1） |
| IPA-08 / IPA-09 | なし | 補足の 1 件ずつ |
| IPA-12 | 上の IN の各テスト | IPA-12 の 1 件（20 件） |
| IPA-15 | `revoke-and-limit.test.ts`「子どもは保護者を外せない（403）。連携していない子どもは外せない」「ほかの人の合言葉は消えない」・`security.test.ts`「自分の子どもの childId を使っても、ほかの子どものテスト期間の id は変えられない」 | IPA-15 の 1 件 |
| PII-10 | `revoke-and-limit.test.ts`「外すと子どもの合言葉はすべて 401」・`tests/server/device-status.test.ts`「連携を外すと消える」 | PII-10 の 2 件 |

---

## ケースごとの記録

各ケースの「日時」は 2026-10-18、「接続先」は プロセス内・PGlite・MOCK=1（ネットワークなし）、「APK / AVD」はなし（共通の条件を参照）。

### IN-01 / IPA-04 SQL インジェクション
- 判定: **PASS**
- 役割: 親A・子A・親B・子B、紐づけ前の人
- 手順: (1) テスト期間の名前に `' OR '1'='1`・`";--`・`test');--`・`test' OR '1'='1` を 1 回ずつ保存。QR の呼び名に `' OR '1'='1`。(2) childId・pairId・QR の番号・テスト期間の id に同じような文字を入れて、読む・消す・変えるを 1 回ずつ。
- 期待: 文字列として扱うか 4xx。他家庭の行を返さない・変えない。SQL の詳細を出さない。
- 実結果: (1) すべて 200 で、送ったとおりの文字列が保存・返却された。テスト期間の行は 4 つだけ増え、親B の一覧は空のまま。(2) childId は 403（uuid の形でない id は DB に聞かずに断る）、pairId は 404、QR の番号は 404、テスト期間の id は 404。親B のテスト期間は変わらない。どの本文にも SQL の文字はない。Drizzle の問い合わせはパラメータつきで、文字をつなげて SQL を作る所はない。
- HTTP status: 200 / 403 / 404
- 証拠: `input.test.ts` の「IN-01/IPA-04: 名前の欄…」「IN-01/IPA-04: id の欄…」

### IN-02 / IPA-05 XSS
- 判定: **PASS**
- 役割: 親A・子A・紐づけ前の人 2 人
- 手順: `<script>alert(1)</script>` と `<img src=x onerror=alert(1)>` を、テスト期間の名前・対象外アプリの名前・利用記録のアプリ名・QR の呼び名に保存し、configGet（子ども）・usageGet（親）・familyGet（親）で読む。src/・modules/・plugins/ を WebView などの語で探す。
- 期待: スクリプトとして動かず、テキストとして出る。
- 実結果: どの API も `application/json` で、送ったとおりの文字列を返した（サーバは HTML を作らない）。アプリの画面は React Native の `<Text>`、Kotlin はネイティブの View で、WebView・`dangerouslySetInnerHTML`・`innerHTML`・`Html.fromHtml`・`loadData`・`evaluateJavascript` はどこにもなく、`react-native-webview` も入っていない。画面に HTML として描く所がないので、タグは文字のまま出る。
- HTTP status: 200
- 証拠: 「IN-02/IPA-05: テスト期間の名前・対象外アプリの名前…」「IN-02/IPA-05: アプリ（src/）と Kotlin（modules/）に…」
- 補足: 実機の画面での見え方は未確認（APK を使う担当の範囲）。

### IN-03 名前の長さと文字
- 判定: **FAIL**
- 役割: 親A・子A、紐づけ前の人
- 手順: テスト期間の名前に 空・空白だけ・121 文字・絵文字 61 個、120 文字ちょうど・絵文字 60 個・結合文字（か＋濁点、e＋アクセント）・家族の絵文字（ZWJ）を送る。QR の呼び名に 空・41 文字・40 文字。テスト期間の名前に NUL（`テスト\u0000名`）。
- 期待: DB と画面の長さの決まりと同じ検証エラー。500 や文字化けにならない。
- 実結果: 長さ・空白・絵文字・結合文字は期待どおり（120・40 ちょうどは 200、超えると 400。結合文字は正規化されずそのまま返る）。上限の数え方は UTF-16 の数で、画面の `maxLength`（120）と同じ。**NUL を入れると 500 internal**（DB が `invalid byte sequence for encoding "UTF8": 0x00` で断る）。本文は一般的な文で、中身は漏れない。同じことが空白期間の名前・QR の呼び名・対象外アプリの名前でも起きる（手元の 1 回ずつの確認）。
- HTTP status: 400 / 200 / **500**
- 証拠: 「IN-03: テスト期間の名前は…」「IN-03: QR の呼び名は…」「IN-03: 名前に NUL…」（it.fails）
- 影響と再現頻度: 毎回再現。ログイン済みの人が送れる（QR の呼び名は紐づけ前の人でも）。データは変わらない（取り消される）が、500 と例外のログ（IN-12）が出る。

### IN-04 日付
- 判定: **FAIL**（軽い）
- 役割: 親A・子A
- 手順: テスト期間に `2026-02-30`・`2026-13-01`・`2026/11/01`・`2026-11-1`・開始 > 終了・時刻つき・`20261101` を送る。usageGet で from > to・190 日超。usageUpload で `2026-02-29`。日本時間 0:30（UTC 15:30）に 10/16 の期間を保存する。0001 年・9999 年の期間を送る。
- 期待: 4xx で拒否。TZ で別の日に化けない。極端な過去・未来も 4xx。
- 実結果: 形・存在・前後の誤りはすべて 400 で、何も保存しない。日付は 10/16 のまま返り、日別上限も日本時間の 10/16 から始まる。**0001-01-01〜0001-01-02 と 9999-12-30〜9999-12-31 のテスト期間は 200 で保存される**（500 にはならず、日別上限の計算も壊れない）。利用記録の日付は 190 日前〜明日だけ受け付ける（既存のテスト）。
- HTTP status: 400 / 200
- 証拠: 「IN-04: 存在しない日・…」「IN-04: 日本時間で日付が変わった直後…」「IN-04: 極端な過去（0001 年）…」（it.fails）「IN-04（記録）: 0001 年・9999 年…」
- 影響: 小さい。親や子どもが意味のない期間を登録できるだけ。画面の一覧が見づらくなる程度。

### IN-05 分の値と版の値
- 判定: **PASS**
- 役割: 親A・子A
- 手順: 通常上限の分に `-1`・`1441`・`1.5`・`1e20`・`"60"`・`null`・`[60]`・`2^31`・`NaN`・`true`、続けて `0`。利用記録の usedMinutes に `-1`・`1.5`・`"5"`・`null`・`1441`・`[5]`、restrictedMinutes に `-1`・`99999999999`。expectedVersion に `2^31`・`2^53-1`・`2^53`・`-1`、knownVersion に `2^31`。
- 期待: 型と範囲を検証。負の値・あふれを保存しない。0 分は有効。
- 実結果: 不正な値はすべて 400 で、通常上限・版・利用記録の行は変わらない。0 分は 200 で保存。expectedVersion の `2^31`・`2^53-1` は 409（DB の整数のあふれにならない）、`2^53` と `-1` は 400。knownVersion `2^31` は 200 で新しい組を返す。
- HTTP status: 400 / 409 / 200
- 証拠: 「IN-05: 通常上限の分に…」「IN-05: 利用記録の usedMinutes…」「IN-05: 版（expectedVersion・knownVersion）の巨大な値…」

### IN-06 アプリの識別子（appId / packageName）
- 判定: **FAIL**
- 役割: 親A・子A
- 手順: 利用記録・端末のアプリ一覧・対象外アプリに、長さ 256・空・空白だけの packageName。制御文字（改行・ベル・CR・タブ）入りの packageName と名前を保存して親が読む。利用記録の packageName を空白だけ（`"   "`）・NUL 入りにする。
- 期待: 空・上限超えを拒否。ログや画面を壊さない。
- 実結果: 長さ 256・空は 400。端末のアプリ一覧・対象外アプリは空白だけも 400。制御文字はそのまま保存され、応答の JSON の中では `\n` などに逃がされ、生の制御文字は応答に入らない。**利用記録の packageName が空白だけだと 500 internal**（契約に空白の検査がなく、DB の `usage_records_app_id_not_blank` に当たる）。**NUL 入りも 500**（利用記録・端末のアプリ一覧の両方）。
- HTTP status: 400 / 200 / **500**
- 証拠: 「IN-06: 長さ 256・空文字は 400…」「IN-06: 制御文字…」「IN-06: 利用記録の packageName が空白だけなら…」（it.fails）「IN-06: 利用記録・端末のアプリ一覧の識別子に NUL…」（it.fails）
- 影響と再現頻度: 毎回再現。子どもの合言葉が要る。端末側（`src/lib/usage-outbox.ts`）は 500 を「直る失敗」として送り直すので、同じ記録が送信待ちに残り続けるおそれがある（端末側の動きは未確認）。
- 補足: 制御文字の入った名前が画面でどう見えるかは、実機では未確認。

### IN-07 余計な項目（mass assignment）
- 判定: **PASS**
- 役割: 親A・子A・親B・子B、紐づけ前の人
- 手順: authGoogle に `role: "parent"`・`userId`（親B）・`isAdmin`。pairStart に `role`・`parentId`・`childId`（子B）・`isAdmin`。通常上限の保存に `role`・`isAdmin`・`ownerId`・`updatedByUserId`（親B）・入れ子の `role`。対象外アプリの保存に `sinceVersion: 999`・`enabled: false`・`childId`（子B）。
- 期待: 許可した項目だけを使い、権限・持ち主・版を書き換えない。
- 実結果: ログインした人は role: null・新しい userId のまま。QR は自分の分だけで parentId は空。通常上限の保存者は親A、対象外アプリの sinceVersion はサーバの版（+1）・enabled は true・保存者は親A、子B の行はできない。全員の role は変わらない。契約の Zod が知らない項目を捨てている。
- HTTP status: 200
- 証拠: 「IN-07: role・isAdmin・ownerId…」、既存の `security.test.ts`「余計な項目で中身を書き換えられない」の 2 件

### IN-08 送信 ID の再利用
- 判定: **PASS**（既存のテストで確認）
- 手順・実結果: 同じ送信 ID・同じ中身の再送は何度でも duplicate で、記録は 1 つ。並びだけ違う再送も duplicate。中身を変えると 409。ほかの子どもが同じ送信 ID を使っても 409 で、相手の中身は返らない。置き換えられた古い送信の再送も duplicate。
- HTTP status: 200（duplicate） / 409
- 証拠: `tests/verify/security.test.ts`「V: 送信 ID の重複」の 3 件、`tests/verify/usage-growth.test.ts`「置き換えられた前の送信を…」、`tests/server/api.test.ts`「同じ送信 ID の送り直しは二重に保存しない」

### IN-09 版の混ざり
- 判定: **PASS**
- 役割: 親A・子A
- 手順: 通常上限とテスト期間を保存した後、子どもが configGet に「サーバより先の版」「古い版」「同じ版」を送る。古い版で保存する。
- 期待: 不整合を拒否するか、一貫した版を返す。古い応答が新しいキャッシュを上書きしない。
- 実結果: 先の版・古い版のどちらにも、今の版の組を丸ごと返す（`changed: true`・組の版 = 今の版）。同じ版なら `changed: false`。古い版の保存は 409 で版は変わらない。端末が遅れて届いた古い組を捨てることは既存のテストで確認。
- HTTP status: 200 / 409
- 証拠: 「IN-09/NET-06: configGet の組は1つの版でそろっている…」、既存の `security.test.ts`「V: 版のずれ」の 2 件、`c3-c7-c8.test.ts`「遅れて届いた古い版の応答は捨て」

### IN-10 業務ルール（0 件・重複・同日・D=0・0 分）
- 判定: **PASS**（既存のテストで確認）
- 実結果: テスト 0 件は通常上限（未設定ではない）、0 分の上限は「0 分の上限」で 0 で割らない、同日開始終了は通る、D=0 は G を適用、重なる期間は 400 で版も日別上限も前のまま、昨日以前の確定値は変えない。
- 証拠: `tests/verify/c10-hand.test.ts`（5 件の純粋な関数・4 件のサーバ）、`tests/server/daily-limits.test.ts`、`tests/verify/c3-c7-c8.test.ts`「上限 0 分…」、`tests/verify/decisions.test.ts`「Q7 …」

### IN-10（未決ルール）
- 判定: **BLOCKED**（人の判断待ち）
- 内容: 次は「仮の既定」で計算しており、仕様として決まっていない。終了日を含むか（`contracts/schemas.ts` の periodFields の TODO）、丸め方と 1 日の最大の減少幅、計画開始日より前の日の上限（`tests/server/daily-limits.test.ts` の TODO(未決)）。決まったら確かめ直す。

### IN-11 大きな本文
- 判定: **PASS**
- 役割: 子A
- 手順: 8 MiB を超える本文を usageUpload に 1 回だけ送る。続けて 100 KiB の idToken を authGoogle に 1 回、health と正しい usageUpload を 1 回ずつ。
- 期待: 明示的なサイズ制限で拒否し、プロセスや DB が不安定にならない。
- 実結果: 400「送る内容が大きすぎます」で、利用記録の行は増えない。100 KiB の idToken は 401。その後の health は 200、正しい送信も 200。上限は 8 MiB（`src/server/app.ts` の MAX_BODY_BYTES。契約で一番大きい利用記録が約 5 MB のため）で、計画の例の 64 KiB より大きいが、明示的な上限はある。
- HTTP status: 400 / 401 / 200
- 証拠: 「IN-11: 上限（8 MiB）を超える本文は 1 回だけ送り…」、既存の `tests/server/body-limit.test.ts` の 3 件

### IN-12 ログ
- 判定: **FAIL**
- 役割: 紐づけ前の人 2 人（紐づけて親子にする）・親A・子A
- 手順: console の出力を手元で受け取りながら、(1) ログイン・QR・利用記録（アプリ名に `x' OR 1=1;--\n[ERROR] 偽の行 {"a":"b"}`）・403 になる要求・壊れた JSON を送る。(2) 500 になる要求（packageName が空白だけ、アプリ名に `ひみつのアプリ\n[INFO] 偽のログの行`）を 1 回送る。
- 期待: ログの改行・偽装を防ぎ、token などの秘密を記録しない。
- 実結果: (1) サーバは何もログに出さない（合言葉・QR の番号も出ない）。(2) **`[internal] DrizzleQueryError: Failed query: insert into "usage_records" …` と、パラメータ（アプリ名）・入力の改行で作った偽の行がそのままログに出る**。合言葉そのものは出ない。応答の本文には出ない。
- HTTP status: 200 / 403 / 400 / 500
- 証拠: 「IN-12: ふつうの流れ…」「IN-12: 500 になった要求でも…」（it.fails）「IN-12（記録）: 上の 500 のとき…」
- 影響: 500 のときだけ。Vercel の実行ログに子どもの利用の詳細（アプリ名）と SQL が残り、ログを読む人を偽の行でだませる。IN-03・IN-06 の 500 と組み合わさると、利用者が狙って起こせる。

### NET-04 利用記録の再送（サーバ側）
- 判定: **PASS**
- 役割: 子A
- 手順: 利用記録を 1 回送り、同じ本文を 1 回だけ再送。時計を 31 日進めて、もう一度送る。
- 期待: 冪等キーで二重保存しない。認証期限切れは再ログインを促す。
- 実結果: 1 回目 accepted、再送 duplicate で、3 つの表の行数は変わらない。31 日後は 401 unauthorized（hint「もう一度 Google でログインしてください」）。端末が 401 を隔離せず送信待ちに残すことは既存のテストで確認。
- HTTP status: 200 / 401
- 証拠: 「NET-04: 同じ利用記録の POST を 1 回だけ再送すると…」、既存の `c3-c7-c8.test.ts`「サーバには保存できたが応答が消えた…」「ログインが切れた（401）ときは…」

### NET-06 古い設定の応答（サーバ側）
- 判定: **PASS**
- 実結果: サーバはいつも今の版の組を 1 組で返す（IN-09）。端末は同じ epoch で版が古い応答を `older_response` として捨て、手元の新しい組を保つ。DB を作り直して版が戻っても epoch で見分ける。画面に「古い」と出るか（stale の表示）は画面の担当の範囲。
- 証拠: 「IN-09/NET-06: …」、既存の `c3-c7-c8.test.ts`「（同じ epoch のとき）遅れて届いた古い版の応答は捨て…」「DB を作り直して…」の 3 件、`tests/server/config-epoch.test.ts`

### NET-08 エラーの応答
- 判定: **PASS**
- 役割: 親A・子A
- 手順: 合言葉なし・でたらめ（401）、子どもが計画を保存（403）、知らない道筋・POST の API を GET（404）、壊れた JSON・型違い・配列（400）、uuid でない pairId・テスト期間の id（404）、ない空白期間の id（404）、版のずれ（409）を 1 回ずつ。
- 期待: 一般化したエラー。DB 名・SQL・ファイルパス・スタックを出さない。
- 実結果: すべて契約の ApiError（code・message・hint）の形で、SQL・`postgres`/`pglite`/`drizzle`・パス・スタック・合言葉は含まない。400 の issues も同じ。`X-Powered-By` などの見出しもない。DB 停止時（AVL-04）も同じ。
- HTTP status: 401 / 403 / 404 / 400 / 409
- 証拠: 「NET-08: 401・403・404…」、既存の `security.test.ts`「V: エラーに中身が漏れない」の 3 件、`api.test.ts`「想定外の例外は internal」

### AVL-01 回数の上限
- 判定: **FAIL**（P2）
- 役割: 紐づけ前の人、子A
- 手順: QR の番号をまちがえて 12 回、authGoogle（MOCK の新しい人）を 20 回、pairStart を 20 回、usageUpload（送信 ID を毎回変える）を 20 回。間を空けずに順番に送る。
- 期待: 小規模な反復で 429 などの制御が働く。単一アカウントで全体が止まらない。
- 実結果: QR の番号の読み取りは 11 回目から 429 で、ほかの人は止まらない（人ごと）。**authGoogle・pairStart・usageUpload は 20 回ともすべて 200**。authGoogle（MOCK）は 20 人分の利用者を作り、usageUpload は日ごとの行は増えないが送信 ID の行が 20 行増える。監査の記録はない。
- HTTP status: 404→429 / 200
- 証拠: 「AVL-01: QR の番号の読み取りは…」「AVL-01: ログイン（authGoogle）を 20 回…」（it.fails）「AVL-01: QR を出す（pairStart）を 20 回…」（it.fails）「AVL-01: 利用記録の送信…」（it.fails）「AVL-01（記録）…」
- 影響: 本番の authGoogle は Google の ID トークンが要るので、新しい人を作るには本物のトークンが要る。pairStart・usageUpload・configGet はログイン済みの人なら何度でも呼べ、DB の行（QR・送信 ID）が増える。

### AVL-02 同じ QR の二重送信
- 判定: **PASS**
- 役割: 紐づけ前の人 3 人（子ども役 1・保護者役 2）
- 手順: 同じ QR の番号を 2 人の保護者が同時に送る（2 本）。続けて子どもが「はい」を同時に 2 回送る。
- 期待: 片方だけ成功し、つながりは 1 つ。
- 実結果: 読み取りは 200 と 409、確定は 200 と 409。family_links の行は 1 つ。
- HTTP status: 200 / 409
- 証拠: 「AVL-02: 同じ QR を 2 人の保護者が同時に読むと…」
- 補足: PGlite は 1 本の接続でトランザクションが順番に進む。Neon（同時に複数の接続）の上での競合は手元では確かめていない（`FOR UPDATE` で行を押さえる書き方にはなっている）。

### AVL-04 DB が止まったとき
- 判定: **FAIL**（軽い）
- 役割: 親A・子A、未認証
- 手順: プロセスの中で DB の接続を「つながらない」状態に差し替える（偽の接続先と偽のパスワードを含む例外を投げる）。planGet・usageUpload・authGoogle・health を 1 回ずつ。元に戻して health と planGet。
- 期待: health は 503。ユーザーデータの API は安全なエラー。例外や秘密を返さず、復旧後に正常化。
- 実結果: 4 つとも 500 internal「うまく処理できませんでした」で、偽の接続先・パスワード・IP・例外の文は本文に出ない。戻すと health 200・planGet 200。**health が 503 でなく 500**。合言葉の確認が先に DB を使うため、通常の API も 401 でなく 500 になる（安全側）。サーバのログには例外が丸ごと出る（IN-12 と同じ）。
- HTTP status: 500 → 200
- 証拠: 「AVL-04: DB が止まると、通常の API は…」「AVL-04: DB が止まると health は 503 を返す」（it.fails）
- 影響: 小さい。監視が 503 で「一時的に使えない」と見分ける場合に、500 だとサーバの不具合と区別できない。

### IPA-06 パストラバーサル
- 判定: **N/A**
- 理由: ファイル名やパスを受け取る API がない（`contracts/api.ts` の表）。サーバの処理（`src/server/`・`backend/src/db/`）でファイルを読み書きするのは、テストのときに DB の写しを開く所（`src/server/db/index.ts`、入力は使わない）だけ。アイコンも DB に base64 で入れる。

### IPA-07 コマンドインジェクション
- 判定: **N/A**
- 理由: `src/`・`backend/src/`・`contracts/`・`modules/`（Kotlin）に `child_process`・`exec`・`spawn`・`Runtime.getRuntime`・`ProcessBuilder` がない。あるのは開発用の `scripts/sync-kids-ui.mjs` の `execFileSync`（引数は固定・シェルを使わない・API からは呼べない）だけ。

### IPA-08 HTTP ヘッダーインジェクション
- 判定: **N/A**
- 理由: リダイレクトや、利用者の入力を応答の見出しに入れる所がない（`src/server/` に `Location`・`redirect`・`headers.set` がない）。
- 補足の確認: QR の呼び名に `x%0d%0aX-Slope-Test: marker` と `x\r\nX-Slope-Test: marker` を送っても、応答の見出しは `content-type` だけ。証拠「IPA-08: 入力に改行と X-Slope-Test を入れても…」

### IPA-09 CSRF
- 判定: **N/A**
- 理由: Cookie を使わない。合言葉は `Authorization: Bearer` で明示して送る（`src/server/auth.ts` の tokenOf）。CORS の設定もない。
- 補足の確認: Cookie に合言葉を入れ、別のオリジン（`http://evil.localhost`）から `text/plain` で更新を送ると 401 で、版は変わらない。`Set-Cookie`・`Access-Control-Allow-Origin` は付かない。証拠「IPA-09: Cookie だけ・別のオリジンからの更新は 401…」

### IPA-11 依存ライブラリ（npm）
- 判定: **PASS**
- 手順: `package-lock.json` と `backend/package-lock.json` をファイルとして読んで数える（ネットに出ない。npm audit は既知のため実行していない）。
- 実結果:
  - ルート: lockfileVersion 3・731 個（本番 600・開発 130・optional 119）。取得元はすべて `registry.npmjs.org`、すべて integrity（ハッシュ）つき、ローカルのリンクなし。インストール時にスクリプトを動かすのは esbuild（3 つの版）と fsevents で、どれも開発用。
  - サーバが読み込む部品: hono 4.13.13・@hono/node-server 2.1.5・drizzle-orm 0.45.4・@neondatabase/serverless 1.2.0・@electric-sql/pglite 0.5.9・postgres 3.4.9・jose 6.2.12・zod 4.6.5・ws 8.22.0。
  - 非推奨（deprecated）の印: text-encoding 0.7.0（react-native-qrcode-svg が使う。アプリに入る）、uuid 7.0.3（xcode が使う。ビルド時だけ）、@esbuild-kit/*（開発用）。
  - 同じ名前で版が違う部品: 66 個。
  - `backend/`: 123 個（本番 3: dotenv 18.0.8・drizzle-orm 0.45.4・postgres 3.4.9）。取得元・integrity はルートと同じく問題なし。TypeScript がルート（6.0.3）と違う版（7.0.2）。
  - 既知のこと（依頼より）: npm audit は Expo/Metro のビルド道具に 32 件、サーバの部品はなし。
  - 採用理由は `package.json` にはないが、Kotlin の部品は `modules/kit-native/android/build.gradle` に理由が書いてある。
- 証拠: `package-lock.json`・`backend/package-lock.json`（数えるのに使った手元のスクリプトはリポジトリに入れていない）

### IPA-11（Android・JVN 照合）
- 判定: **BLOCKED**
- 内容: Kotlin の直接の依存は androidx.room 2.8.4（runtime・ktx・compiler）、kotlinx-coroutines-android 1.10.2、junit 4.13.2（テストだけ）。KSP は Expo が決めた版。`android/` は `npx expo prebuild` の生成物で Git に入っておらず、Gradle のロックファイル（`gradle.lockfile`）も推移的な依存の一覧もない。推移的な依存と release に入る SDK の一覧は、APK を作って調べる担当の範囲。IPA/JVN との照合はネットに出ないため未実施。

### IPA-12 入力ファジング（入力の部分）
- 判定: **FAIL**（原因は IN-03・IN-06 と同じ）
- 手順: 必須の欠け・型違い・境界・未知の項目・上限+1 を 20 件（authGoogle・sign-out・pair 3 本・plan/save 2・test-period・blank-period・excluded-apps 2・blocked-sites・usage/upload 2・icons 2・device-status・config/get）、1 回ずつ。その後 health と planGet。
- 期待: 不正な入力は安定して 4xx。サービスは通常に戻る。
- 実結果: 20 件すべて 4xx（400・403）で、本文に中身は出ない。その後も health 200・planGet 200。ただし別のケースで、**NUL 入りの文字列（IN-03・IN-06）と空白だけの packageName（IN-06）は 500**。
- HTTP status: 400 / 403 / 200
- 証拠: 「IPA-12: 欠け・型違い・境界・未知の項目・上限+1 の 20 件は…」、IN-03・IN-06 の it.fails
- 補足: 遅延やメモリの急増は見ていない（プロセス内で 20 件だけのため）。

### IPA-15 破壊的な操作（拒否と範囲）
- 判定: **PASS**
- 役割: 親A・子A・親B・子B
- 手順: 親A が子B を外す、子A が自分を外す、子B が自分を外す、親A が子B のテスト期間を消す（子B の childId で・自分の子の childId で）、親B が古い版で消す、親A が子B の空白期間を消す。親A が「ほかの端末からもログアウト」。
- 期待: 子どもや他家庭からの破壊的な操作を拒否し、範囲を限定する。
- 実結果: 外す操作は 403（親A→子B）・403（子どもは保護者の操作ができない）。消す操作は 403（他家庭の childId）・404（自分の子の childId で他家庭の id）・409（古い版）。親B の合言葉は使えたまま。子B のテスト期間・つながりは残る。
- HTTP status: 403 / 404 / 409 / 200
- 証拠: 「IPA-15: 親A は子B を外せず…」、既存の `revoke-and-limit.test.ts`「子どもは保護者を外せない」「ほかの人の合言葉は消えない」

### IPA-15（監査・確認画面・復旧）
- 判定: **BLOCKED**
- 内容: 外す操作（familyUnlink）・期間の削除・ログアウトに監査の記録（誰が・いつ）の表がない（テスト期間は「作った人」だけ残る）。外す画面はまだない（アプリから familyUnlink を呼ぶ所がない）ので、二段階の確認はまだ確かめられない。DB のバックアップと復元（Neon）は手元だけでは試せない。外したつながりを元に戻す手段は、QR で紐づけ直すことだけ（設定・利用記録は残っているので続きから使える）。

### PII-10 連携を外した後（サーバ側）
- 判定: **PASS**
- 役割: 親A・子A
- 手順: 利用記録と端末の許可の状態を送ってから、親A が子A を外す。外した後に、子どもの古い合言葉で送信待ちの記録を送る。親A が利用記録・許可の状態を読む。子どもがログインし直して、同じ記録を送る。
- 期待: 削除済み・無効にしたデータが、同期の再送や別の画面から復活しない。
- 実結果: 古い合言葉は 401、ログインし直しても役割なしで 403、どちらも送信 ID の行は増えない。親A は 403。端末の許可の状態は消える（既存のテスト）。
- HTTP status: 401 / 403
- 証拠: 「PII-10: 外すと子どもの合言葉は 401…」、既存の `revoke-and-limit.test.ts`「外すと子どもの合言葉はすべて 401…」・`device-status.test.ts`「連携を外すと消える」

### PII-10（外した後の残り）
- 判定: **BLOCKED**（保持の仕様が未決）
- 手順: 子A が利用記録とアプリ一覧を送る → 親A が外す → 子A が別の保護者と紐づける → その保護者が利用記録とアプリ一覧を読む。
- 実結果: **前の家庭のときの利用記録（アプリ名・分）とアプリ一覧が、新しい保護者に見える**。今の動きは `src/server/auth.ts` の unlinkChild の TODO(未決)「外した子どもの設定・利用記録を消すか残すか。今は残す」のとおり。消すか残すかを人が決めたら、合否を決め直す。
- 証拠: 「PII-10（記録・仕様未決）: 外した後も利用記録・端末のアプリ一覧は…」

### PII-10（削除の機能）
- 判定: **BLOCKED**（機能なし）
- 内容: 利用記録を消す API・アカウントを消す API がない（`contracts/api.ts`）。端末の cache・送信待ちに残るかは端末側の担当の範囲。

---

## 実行の記録

- `npx vitest run tests/security-plan/input.test.ts --maxWorkers=2` → Tests 31 passed | 9 expected fail（40）
- 対応表に挙げた既存のテスト 11 ファイル（`tests/verify/` の security・usage-growth・c3-c7-c8・c10-hand・decisions・revoke-and-limit、`tests/server/` の body-limit・daily-limits・api・device-status・config-epoch）→ 2 回目は 202 passed（11 ファイル）。
  - 1 回目は、別の調べる役のテストと同時に走って CPU が混んでいる中で、2 件が DB の見本の入れ直しのときの `duplicate key … users_pkey`（デモの保護者の行）で失敗した。2 回目は同じコマンドで全部通った。テストの土台（見本の入れ直し）が混んでいると不安定になることがある、という記録（安全面の穴ではない）。
- `npm run lint` → エラーなし（警告 2 件。このテストのファイルの分ではない）。`npm run typecheck` → エラーなし。
