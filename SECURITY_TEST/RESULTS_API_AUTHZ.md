# API の認証・認可・個人情報の漏えい — テスト結果

計画: [ANDROID_SECURITY_TEST_PLAN.md](ANDROID_SECURITY_TEST_PLAN.md)
担当: A（API-01〜12）、PII-01〜03・PII-07・PII-08・PII-09（サーバで確かめられる部分）、IPA-01・IPA-02・IPA-03・IPA-12（API の部分）
役割: 調べる役。アプリのコード（src/・backend/・contracts/・modules/）は変えていない。穴は直していない。

## 共通の条件

| 項目 | 内容 |
|---|---|
| 日時 | 2026-10-18（JST） |
| 対象のコード | ブランチ `security/android-security-test-plan`（基点 `0ddfc7e`。`main` の `9883d2b` ＋ 計画の文書） |
| APK version / SHA-256 | 対象外（APK は使っていない。サーバの API だけ） |
| Android API level / AVD | 対象外 |
| 接続先 | プロセス内・PGlite・MOCK=1（ネットワークなし）。サーバは Hono の `app.request` で呼び、HTTP サーバは立てていない。テストの頭で `DATABASE_URL`・`LOCAL_DB_DIR` が空で `MOCK=1` であることを確かめ、違えば止める |
| テスト内の時計 | 2026-10-15 12:00（JST）に固定（`Date` だけ偽の時計） |
| テスト用アカウント | MOCK のログイン（idToken `mock-new-…`）で作った架空の人だけ。親A↔子A、親B↔子B を QR で紐づける。QR のケースでは、まだ紐づいていない架空の 子C・親C・親D・子E・子F を足す。デモの3人（見本）は入れていない |
| テストのデータ | 家族ごとに見分け用の文字を入れた架空のデータ（子どもの呼び名・利用記録・アプリ一覧とアイコン・端末の許可の状態・通常上限・テスト期間・空白期間・対象外アプリ・制限する Web サイト） |
| 送る回数 | 1つのケースで送る「攻撃の要求」は 20 回まで（テストの道具 `hit()` が数え、超えたら止める）。準備（ログイン・紐づけ・データ作り・確認の読み取り）は数えていない |
| 証拠 | `tests/security-plan/authz.test.ts`（以下「新」）と、もともとある `tests/verify/`・`tests/server/` のテスト |
| 実行 | `npx vitest run tests/security-plan/authz.test.ts --maxWorkers=2`（関係する既存のテストも流した。下の「実行の記録」） |
| 秘密の値 | 合言葉・QR の番号などの値はこの記録に書いていない（テストの中で作って、その場で使うだけ） |

判定: PASS（期待どおり拒否・保護）／FAIL（越権・漏えいを再現）／BLOCKED（この条件では確かめられない）／N/A（対象がない）。
「確かめた範囲」はサーバの応答（HTTP status と JSON の中身）と、拒否のあとの DB（子どもの id をもつすべての表・2人の users・つながり・合言葉の取り消し状態）。端末・画面・Logcat は見ていない。

## まとめ

| ケース ID | 判定 | 一言 |
|---|---|---|
| API-01 | PASS | 合言葉なしの保護対象 API（20本）はすべて 401。中身・DB の変化なし |
| API-02 | PASS | 空・形違い・壊れた・偽・1文字違い・取り消し済み・期限切れ・URL の引数は 401。送った値を返さない |
| API-03 | PASS | 子Aが保護者向けの設定変更（8本）を呼ぶと 403。設定もつながりも変わらない |
| API-04 | PASS | 親Aが子Bの記録・設定など（10本）を読むと 403。子Bのデータは入らない |
| API-05 | PASS | 親Aが子Bを書く（11本）と 403。自分の子の id に子Bの期間 id を混ぜると 404。両家族の DB は不変 |
| API-06 | PASS | 子Aが childId を子Bにして送る（8本）と 403。子Bの DB は不変 |
| API-07 | PASS | 本文の role・userId・parentId・createdBy… は無視され、サーバの値が使われる |
| API-08 | PASS（一部 BLOCKED） | `src/server`: health は ok・mock だけ、未知は 404、残り14本は 401。`backend/src/server.ts` は実行していない（BLOCKED） |
| API-09 | PASS | 同じ QR の2回目・確定後・期限切れは 409。別の親子はつながらない |
| API-10 | PASS | 読み取りに別の子の id を混ぜても、QR を出した子とだけつながる |
| API-11 | PASS | 確定・読み取り・利用記録の再送で、つながり・記録は1つだけ |
| API-12 | PASS（時間は未確認） | ない id と権限のない id で status・本文・大きさが同じ。時間の差は測っていない |
| PII-01 | **FAIL** | 1家族の中ではほかの家族の分は出ない（PASS）。ただし連携を外して別の保護者と紐づけ直すと、前の保護者の userId と前の家族のときの設定・記録が新しい保護者に見える |
| PII-02 | PASS | 子の id・日付・送信 ID・アプリ名を差し替えても、家族Bの行は返らず集計にも混ざらない |
| PII-03 | PASS（要検討1点） | 応答は契約の項目だけで内部の列はない。QR を読んだだけの保護者に子どもの userId が返る点は要検討 |
| PII-07 | PASS | 無効な id・拒否・DB 停止・期限切れの応答に SQL・スタック・接続先・別の人の情報・合言葉が出ない |
| PII-08 | PASS | 同じ呼び名・同じアプリ・同じ分数でも、親の一覧・記録・アプリ一覧に別の家族の分が混ざらない |
| PII-09 | **FAIL** | 出し直し・期限切れ・使用済み・取り消しの QR は読めない（PASS）。ただし子どもがログアウトしても、出していた QR は期限まで読め、もう一度ログインすれば確定できる |
| IPA-01 | PASS | 合言葉なしでは、どの id を送っても同じ 401。保護データは出ない |
| IPA-02 | PASS | 本文の childId・role・parentId を家族Bの値にしても 403。両家族のデータは不変 |
| IPA-03 | PASS | ログアウト前の要求の再送・期限切れの合言葉は 401。前の情報を返さず、何も変わらない |
| IPA-12 | PASS | 欠け・型違い・境界外・未知の項目・壊れた JSON・深い入れ子・`__proto__` は 4xx。5xx なし・DB 不変・そのあとも使える |

件数（22 ケース）: PASS 20／FAIL 2／BLOCKED 0／N/A 0。
PASS のうち、API-08 は `backend/src/server.ts` の部分だけ BLOCKED、API-12 は時間の差を未確認、PII-03 は要検討1点がある。

## 既存のテストとの対応

もとからあるテストで同じことを確かめているものは、証拠に足した。既存のテストはデモの見本（デモの保護者・子ども）を使い、多くは HTTP status だけを見ているので、新では架空の 4人で、応答の JSON の中身と DB の変化まで確かめ直した。

| ケース | もとからあるテスト（ファイル › テスト名） | 新で足したこと |
|---|---|---|
| API-01 | `tests/server/api.test.ts` › 「合言葉なし・でたらめな合言葉は 401」「合言葉の確認は入力の検査より先（ログインしていない人に入力の詳細を返さない）」／`tests/verify/security.test.ts` › 「合言葉がない・違うときは、入力の詳細（issues）を返さない」 | 保護対象の全 API（34本）を API-01 と API-08 に分けて、1本ずつ合言葉なしで呼ぶ。本文の中身・DB を確かめる |
| API-02 | `tests/verify/google-token.test.ts`（Google の ID トークン: aud・iss・exp・署名・alg none・sub・jose の文）／`tests/verify/revoke-and-limit.test.ts` › 「ログアウトした合言葉は、サーバでも 401 になる…」／`tests/server/api.test.ts` › 「30日使われなかった合言葉は無効になる」／`tests/verify/mock-session-guard.test.ts`（MOCK でないサーバではデモの固定の合言葉は 401） | アプリの合言葉の形違い・偽・1文字違い・URL の引数。応答に送った値が入らないこと |
| API-03 | `tests/verify/security.test.ts` › 「子どもの合言葉で保護者だけの操作は、自分の childId でもすべて 403」／`tests/server/api.test.ts` › 「子どもの合言葉で保護者の操作（計画の保存・対象外アプリの保存・空白期間）は 403」／`tests/verify/revoke-and-limit.test.ts` › 「子どもは保護者を外せない（403）…」 | DB 全体が変わらないこと |
| API-04・05 | `tests/verify/security.test.ts` › 「連携していない子どもに対しては、すべての API が 403 で、相手の版も変わらない」「自分の子どもの childId を使っても、ほかの子どものテスト期間の id は変えられない（not_found）」／`tests/server/api.test.ts` › 「保護者は連携済みの子どもだけを見られる。連携していない子どもは 403」 | 応答に子Bのデータが入らないこと。空白期間の id を混ぜる場合。両家族の DB 全体 |
| API-06 | `tests/verify/security.test.ts` › 「子どもは、ほかの子どもの childId では、読む・書く・送るのどれも 403」／`tests/server/device-status.test.ts` › 「送れるのは自分の childId だけ。ほかの子どもの childId は 403 で、どこにも保存しない」 | 子Bの DB 全体が変わらないこと |
| API-07 | `tests/verify/security.test.ts` › 「テスト期間の更新で createdByRole・createdByUserId を送っても無視され、作った人は変わらない」「計画の保存で version・updatedAt・childId（ほかの子ども）を混ぜても、サーバの値が使われる」／`tests/verify/decisions.test.ts` › 「同じ人がもう一度ログインしても、確定した役割は変わらない…」 | ログイン・利用記録・計画の本文に role・userId・parentId を混ぜる。DB の役割とつながり |
| API-08 | `tests/server/api.test.ts` › 「health は契約どおり」「契約にない道筋は 404 + ApiError(not_found)」 | health の本文・ヘッダー、違う method、残り14本の 401 |
| API-09 | `tests/server/api.test.ts` › 「同じ QR を2回読む（二重読取）と、2回目は使用済みの conflict」「10分たった QR は期限切れ（読み取りは conflict、進み具合は expired）」／`tests/verify/security.test.ts` › 「期限切れの直前（10分ちょうど）はまだ読めるが、確定前に10分を過ぎると確定できず、連携もしない」／`tests/verify/decisions.test.ts` › 「「いいえ」で断られた QR は、もう読めない（1回だけ）」 | 確定後に別の保護者が読む場合。DB のつながり |
| API-10 | `tests/server/api.test.ts` › 「確定は QR を出した子どもだけ（保護者は 403）。関わっていないペアリングは not_found」／`tests/verify/security.test.ts` › 「ペアリングの進み具合は、関わっていない人には not_found（あるかどうかも漏らさない）」 | 読み取りの本文に別の子の id を混ぜる。ほかの子による確定・取り消し |
| API-11 | `tests/verify/security.test.ts` › 「同じ送信 ID の再送は何度でも duplicate で、記録は1つ・中身も変わらない」／`tests/server/api.test.ts` › 「同じ送信 ID の送り直しは二重に保存しない（duplicate）。中身が違えば conflict」 | 紐づけの確定・読み取りの再送 |
| API-12 | `tests/verify/security.test.ts` › 「ペアリングの進み具合は、関わっていない人には not_found（あるかどうかも漏らさない）」 | childId・期間の id でも、本文と大きさが同じこと |
| PII-01 | （まとめて確かめるものはない） | 4人で全部の読み取り。紐づけ直し |
| PII-02 | `tests/verify/security.test.ts` › 「ほかの子どもが同じ送信 ID を使っても conflict で、その子どもの記録は増えず、相手の中身も返らない」 | 日付の範囲・アイコン・設定の組 |
| PII-03 | `tests/server/auth-pair-persistence.test.ts` › 「stores only a session digest…」「…keeps its code digest private…」 | 応答ごとの項目の一覧と、内部の列の名前が出ないこと |
| PII-07 | `tests/verify/security.test.ts` › 「壊れた JSON は 400 bad_request で、JSON の解析器の文（SyntaxError）を返さない」「C10 が計算できない入力の文は利用者向けの日本語で、スタックや内部の名前を含まない」／`tests/server/api.test.ts` › 「想定外の例外は internal（中身は漏らさない）」／`tests/verify/google-token.test.ts` › 「エラーの本文に jose の例外の文…を出さない」 | DB が止まったとき（接続先・合言葉らしき文字を含む例外）、無効な id、期限切れ |
| PII-08 | `tests/verify/decisions.test.ts` › 「familyGet は一覧の形で1人だけ。2人目の子どもの紐づけは conflict」（一部） | 同じ呼び名・同じ記録の2家族 |
| PII-09 | `tests/verify/security.test.ts` › 「code に合言葉・userId・名前・pairId が入らず、推測されにくい長さの乱数（16進 40 文字）」／`tests/server/api.test.ts` › 「QR を出し直すと前の QR は無効になる」／`tests/verify/decisions.test.ts` › 「読まれた（claimed）QR も、出し直すと expired になり、確定できない」／`tests/verify/revoke-and-limit.test.ts` › 「10 回まちがえると、正しい番号でも 429 rate_limited で断る」 | 応答・DB・ログに番号が出ないこと。取り消した QR。ログアウトした後の QR |
| IPA-01 | API-01・API-08 と同じ | どの id を送っても同じ 401 |
| IPA-02 | API-04〜07 と同じ | childId・role・parentId をまとめて差し替え |
| IPA-03 | `tests/verify/revoke-and-limit.test.ts` › 「ログアウトした合言葉は、サーバでも 401 になる…」「「ほかの端末からもログアウト」は…」／`tests/server/api.test.ts` › 「30日使われなかった合言葉は無効になる」 | ログアウト前の書く要求の再送と DB |
| IPA-12 | `tests/server/body-limit.test.ts` › 「上限を超える本文は、読み込む前に 400 bad_request（利用者向けの文）」（8MB を超える本文を1回）／`tests/server/api.test.ts` › 「契約外の入力は 400 + ApiError(bad_request)（issues つき）」／`tests/verify/decisions.test.ts` › 「契約: 0 と 1440 は通る。-1・1441・小数・文字・欠け・G > S は通らない…」 | 深い入れ子・`__proto__`・未知の項目、DB 不変、そのあとも使えること |

## ケースごとの記録

### API-01

```text
ケースID: API-01
判定: PASS
日時: 2026-10-18
APK version / SHA-256: 対象外（サーバの API だけ）
Android API level / AVD: 対象外
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 親A↔子A（データ入り）。要求は合言葉なし
手順: 保護対象の API のうち、個人データを読む14本（authMe・linkStatus・familyGet・pairStatus・planGet・testPeriodList・
  blankPeriodList・configGet・usageGet・excludedAppsGet・blockedSitesGet・childAppsGet・childAppIconsGet・deviceStatusGet）と
  危ない書く6本（planSave・usageUpload・familyUnlink・pairClaim・pairConfirm・authSignOut）を、子Aの本当の id を入れた正しい本文で
  1本1回ずつ、Authorization なしで呼ぶ（20回）。前後で家族Aの DB を比べる
期待結果: 401。個人データ・内部情報を返さない。DB が変わらない
実結果: 20本すべて 401 unauthorized。本文は code・message・hint の3項目だけで、子A・親Aの id・名前・記録・合言葉、
  入力の詳細（issues）、例外の文は入っていない。DB は変わらない
HTTP status / 相関ID: 401 / 相関 ID の仕組みはない
証拠ファイル: 新 › 「API-01 合言葉なしで保護対象の API（個人データを読む14本・危ない書く6本）を呼ぶと、すべて 401 で個人データを返さず、DB も変わらない」
  ／新 › 「API-01/API-08 の対象を合わせると、契約の保護対象（auth が none 以外）の API が重なりなく全部入る」（34本の漏れがないこと）
  ／上の「既存のテストとの対応」
影響と再現頻度: なし（毎回同じ）
```

### API-02

```text
ケースID: API-02
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 親A↔子A。親Aの合言葉を元にした偽物。親Aの2台目（ログアウト済み）
手順: usageGet（子Aの記録）に次の Authorization を1回ずつ送る: 空の Bearer／"Bearer" だけ／Basic 方式／記号だらけの壊れた形／
  偽の乱数（32バイト）／署名なしの JWT の形／本物の合言葉の最後の1文字違い（7回）。
  authMe に、合言葉を URL の引数（token・access_token）で渡す（1回）。ログアウトした2台目の合言葉（1回）。
  最後に使ってから30日を過ぎた合言葉（1回）。合わせて10回
期待結果: 401。例外のスタックや送った合言葉を応答に含めない
実結果: すべて 401 unauthorized。本文は3項目だけで、送った合言葉・例外の文・子Aのデータは入っていない。URL の引数の合言葉は受け付けない
HTTP status / 相関ID: 401 / なし
証拠ファイル: 新 › 「API-02 空・形の違う・壊れた・偽の・1文字違い・取り消し済み・期限切れの合言葉は 401 で、送った合言葉や例外を返さない」
  ／Google の ID トークン（期限切れ・署名不正・aud/iss 違い・alg none）は tests/verify/google-token.test.ts
影響と再現頻度: なし
```

### API-03

```text
ケースID: API-03
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 子A（自分の childId を使う）
手順: 子Aの合言葉で、保護者向けの設定変更 8本（planSave・usualLimitSave・blankPeriodCreate/Update/Delete・excludedAppsSave・
  blockedSitesSave・familyUnlink）を、正しい版・自分の childId で1回ずつ呼ぶ（8回）。前後で家族Aの DB と設定の版を比べる
期待結果: 403。設定が変わらない
実結果: 8本すべて 403 forbidden。DB（設定・期間・つながり・合言葉の状態）と版は変わらない
HTTP status / 相関ID: 403 / なし
証拠ファイル: 新 › 「API-03 子Aの合言葉で保護者向けの設定変更 API（自分の childId）を呼ぶと 403 で、設定もつながりも変わらない」
影響と再現頻度: なし
```

### API-04

```text
ケースID: API-04
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 親A（攻撃側）、親B↔子B（データ入り）
手順: 親Aの合言葉で、子Bの id を入れた読み取り 10本（planGet・testPeriodList・blankPeriodList・configGet・usageGet・
  excludedAppsGet・blockedSitesGet・childAppsGet・childAppIconsGet・deviceStatusGet）を1回ずつ（10回）
期待結果: 親子の関係をサーバで確かめて拒否する
実結果: 10本すべて 403 forbidden。応答には子Bの id（送った値そのものも）・名前・記録・設定・送信 ID・期間の id が入らない。家族Bの DB は不変
  （configGet は子どもが呼ぶと版を書くが、親の呼び出しなので書かない）
HTTP status / 相関ID: 403 / なし
証拠ファイル: 新 › 「API-04 親Aが子Bの利用記録・設定・アプリ一覧・アイコン・端末の状態を読むと、すべて 403 で子Bのデータが入らない」
影響と再現頻度: なし
```

### API-05

```text
ケースID: API-05
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 親A（攻撃側）、親B↔子B
手順: (1) 親Aが子Bの id と子Bの正しい版で書く 11本（planSave・usualLimitSave・testPeriodCreate/Update/Delete・
  blankPeriodCreate/Update/Delete・excludedAppsSave・blockedSitesSave・familyUnlink）を1回ずつ。
  (2) childId は自分の子（子A）にして、子Bのテスト期間・空白期間の id で更新・削除を1回ずつ（4回）。合わせて15回
期待結果: 画面の非表示に頼らず API が拒否する
実結果: (1) は 11本すべて 403 forbidden。(2) は 4本すべて 404 not_found（「ない id」と同じ答え）。
  家族B・家族Aの DB は変わらない（子Bの期間・つながり・合言葉は残ったまま）
HTTP status / 相関ID: 403・404 / なし
証拠ファイル: 新 › 「API-05 親Aが子Bの id で書く（11本）と 403、自分の子の id に子Bの期間の id を混ぜると 404。どちらの家族の DB も変わらない」
影響と再現頻度: なし
```

### API-06

```text
ケースID: API-06
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 子A（攻撃側）、親B↔子B
手順: 子Aの合言葉で、childId を子Bにした usageUpload・childAppsUpload・childAppIconsUpload・deviceStatusReport・
  testPeriodCreate/Update/Delete・configGet（子どもが呼ぶと版を書く）を1回ずつ（8回）
期待結果: 合言葉の本人と childId の不一致を拒否する
実結果: 8本すべて 403 forbidden。子Bの利用記録・アプリ一覧・アイコン・許可の状態・期間・「子どもが使っている版」は変わらず、子Aの DB も変わらない
HTTP status / 相関ID: 403 / なし
証拠ファイル: 新 › 「API-06 子Aが childId を子Bにして利用記録・アプリ一覧・アイコン・端末の状態・テスト期間を送ると 403 で、子Bの DB は変わらない」
影響と再現頻度: なし
```

### API-07

```text
ケースID: API-07
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 親A・子A・親B・子B、新しく作る架空の人1人
手順: (1) ログインの本文に role: parent・userId（親A）・parentId を混ぜる。(2) その人（役割なし）が role: parent を名乗って子Aの計画を読む。
  (3) 子Aが通常上限の保存に role: parent・parentId を混ぜる。(4) 子Aがテスト期間を作るときに createdByUserId（親A）・createdByRole: parent を混ぜる。
  (5) 子Aの利用記録に userId・parentId（家族B）・role を混ぜる。(6) 親Aの計画の保存に parentId・userId（親B）を混ぜる（6回）
期待結果: クライアントが送る役割・持ち主を信じず、拒否するか無視する
実結果: (1) 新しい人（role: null、親Aとは別の userId）になる。(2)(3) 403。(4) 作った人は子A（DB の created_by_user_id も子A）。
  (5)(6) 保存されるのは子Aの分だけ。どの後も役割（親A=parent・子A=child）とつながり（A↔A・B↔B の2本だけ）は DB のまま。家族Bの DB は不変
HTTP status / 相関ID: 200・403 / なし
証拠ファイル: 新 › 「API-07 本文の role・userId・parentId・createdByUserId・createdByRole を書き換えても、サーバの値が使われる」
影響と再現頻度: なし
```

### API-08

```text
ケースID: API-08
判定: PASS（src/server のアプリの入口）／BLOCKED（backend/src/server.ts）
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 合言葉なし（家族Aのデータを入れておく）
手順: GET /api/health。未知の道筋（GET /api/no-such-api・GET /health）と、POST の API を GET で呼ぶ（GET /api/plan/get）。
  API-01 で呼ばなかった残りの保護対象 14本（pairStart・pairCancel・usualLimitSave・testPeriodCreate/Update/Delete・
  blankPeriodCreate/Update/Delete・excludedAppsSave・blockedSitesSave・childAppsUpload・childAppIconsUpload・deviceStatusReport）を
  合言葉なしで1回ずつ（合わせて18回）
期待結果: health に秘密・環境変数・SQL の詳細がない。未知の道筋は 404。アプリの API は合言葉なしを拒否
実結果: health は 200 で本文は {ok, mock} の2項目だけ（接続先・版・環境の名前なし。x-powered-by・server のヘッダーもなし）。
  未知の道筋・違う method は 404 not_found（3項目だけ）。14本すべて 401。家族Aの DB は不変
HTTP status / 相関ID: 200・404・401 / なし
証拠ファイル: 新 › 「API-08 health は ok と mock だけを返し、未知の道筋・違う method は 404、残りの保護対象（14本）は合言葉なしで 401」
BLOCKED の理由: backend/src/server.ts（GET /health とそれ以外の 404 だけのサーバ）は、読み込むと 0.0.0.0 で待ち受けを始め、
  本物の DB の接続（DATABASE_URL）を要るため、「HTTP サーバを外に向けて立てない・外の DB につながない」の決まりで動かしていない。
  なお Vercel の入口（server.ts）が公開するのは src/server/app.ts で、backend/src/server.ts ではない。
  コードを読んだ限りでは、health は {status, database} だけ、DB 失敗は 503 {status} だけ、それ以外は 404 {error} だけを返す（実行による確認ではない）
影響と再現頻度: なし
```

### API-09

```text
ケースID: API-09
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 子C（QR を出す）・親C（読む）・親D（あとから読む）・子E（期限切れの QR）。家族A・B もいる
手順: 子Cが QR を出し、親Cが読む（200）→ 同じ QR を親Dが読む → 子Cが確定 → もう一度親Dが読む。子Eが QR を出し、10分＋1ミリ秒たってから親Dが読む（4回）
期待結果: 成功は1回だけ。使用済み・期限切れは拒否し、別の親子を結びつけない
実結果: 2回目・確定後・期限切れはどれも 409 conflict（子どもの id は応答に入らない）。つながりは 親C↔子C の1本だけが増え、
  親D・子Eはどこにもつながらず、役割も null のまま
HTTP status / 相関ID: 200・409 / なし
証拠ファイル: 新 › 「API-09 同じ QR を2回読むと2回目は 409、確定後に別の保護者が読んでも 409、期限切れも 409。どれも別の親子を結びつけない」
影響と再現頻度: なし
```

### API-10

```text
ケースID: API-10
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 子C（QR を出す）・親C（読む）。子B・親A（関わっていない人）
手順: 親Cが、QR の番号に加えて childId（子B）・pairId（家族Bのペアリング）を本文に混ぜて読む。
  子Bが子Cの QR を確定・取り消し、親Aが子Cの QR を確定（4回）。最後に子Cが確定する
期待結果: QR に紐づく子ども本人以外とつながらない
実結果: 読み取りの応答の子どもは子C（混ぜた子Bの id は無視）。子B・親Aの確定・取り消しは 404 not_found（子Cの id は応答に入らない）。
  確定後、親Cのつながりは子Cだけ。家族Bの DB は不変
HTTP status / 相関ID: 200・404 / なし
証拠ファイル: 新 › 「API-10 QR の読み取りに別の子の id を混ぜても、QR を出した子とだけつながる。ほかの子・関わっていない保護者は確定・取り消しできない」
影響と再現頻度: なし
```

### API-11

```text
ケースID: API-11
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 子C・親C
手順: 子Cの確定（200）を同じ本文でもう一度送る。親Cの読み取りを同じ番号でもう一度送る。子Cの利用記録を同じ送信 ID・同じ中身で2回送る（5回）
期待結果: 二重のつながり・二重の記録を作らない
実結果: 確定の再送は 409、読み取りの再送は 409。つながりは1本だけで、連携状態は linked。
  利用記録は accepted → duplicate で、その日の記録（usage_day_reports）とアプリの行（usage_records）は1つずつ
HTTP status / 相関ID: 200・409 / なし
証拠ファイル: 新 › 「API-11 紐づけの確定・読み取り・利用記録の送信を同じ本文で再送しても、つながり・記録は1つだけ」
気づいたこと（FAIL ではない）: 確定の再送の 409 の文は「まだ保護者が読み取っていません」で、実際の状態（もう linked）と合わない。
  応答を受け取れなかった端末が再送したとき、利用者を迷わせるおそれがある（安全面の問題ではない）
影響と再現頻度: なし
```

### API-12

```text
ケースID: API-12
判定: PASS（時間は未確認）
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 親A・子A（攻撃側）、家族B
手順: 次の組ごとに、ない id と、あるが権限のない id を1回ずつ送り、status・本文・大きさ（バイト）を比べる（12回）。
  親Aの planGet: 形の違う id／ない uuid／子Bの id／親Bの id。子Aの planGet: ない uuid／子Bの id。
  親Aの testPeriodUpdate（自分の子の id）: ない期間の id／子Bの期間の id。親Aの blankPeriodDelete: 同じく。親Aの pairStatus: ないペアリング／家族Bのペアリング
期待結果: アカウントや家族の有無を推測できる差を作らない
実結果: どの組も status・本文・大きさが完全に同じ（403 または 404）
HTTP status / 相関ID: 403・404 / なし
証拠ファイル: 新 › 「API-12 ない id・形の違う id と、あるが権限のない id で、status・本文・大きさが同じ（アカウントや家族の有無が分からない）」
未確認: 応答にかかる時間の差。プロセス内の呼び出しでは時間の測り方がぶれるので測っていない
気づいたこと（FAIL ではない）: 利用記録の送信 ID は全体で1つの表にある。ほかの子どもがすでに使った送信 ID で送ると 409、
  使われていない ID なら 200 になるので、「その送信 ID がどこかで使われたか」だけは分かる（相手の中身は返らない。
  tests/verify/security.test.ts の「ほかの子どもが同じ送信 ID を使っても conflict…」）。送信 ID は端末が作る乱数（UUID）なので、
  推測はほぼできない
影響と再現頻度: なし
```

### PII-01

```text
ケースID: PII-01
判定: FAIL
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 親A・子A・親B・子B（それぞれ見分け用の文字を入れたデータ）。紐づけ直しでは新しい保護者 親C
手順: (1) 親Aが読める 13本（authMe・linkStatus・familyGet と子Aの id での読み取り 10本）、子Aが読める 5本（authMe・linkStatus・
  configGet・testPeriodList・excludedAppsGet）を読み、応答の JSON 全体に家族Bの値（id・名前・見分けの文字・Web サイト・送信 ID・
  期間とペアリングの id・合言葉）が入らないかを見る。同じ家族の別の役割として、子Aが保護者向けの usageGet・familyGet を読む（合わせて20回）。
  (2) 親Aが子Aを外し（ふつうの操作）、子Aがもう一度ログインして、別の家族の保護者 親C と紐づく。親Cが子Aの読み取り 7本を呼ぶ（7回）
期待結果: 持ち主と役割に必要な情報だけを返し、別の家庭の ID・プロフィール・履歴は一切含まない
実結果: (1) は期待どおり（PASS）。家族Bの値は1つも入らず、自分の家族の値（子Aの id・呼び名・アプリ名・テスト期間・空白期間・Web サイト）は入っている。
  親Aの応答に子Aの合言葉、子Aの応答に親Aの合言葉は入らない。子Aの保護者向けの読み取りは 403。
  (2) は FAIL。新しい保護者 親C の応答に、前の家族の値が出る:
   - テスト期間の一覧の createdByUserId に、前の保護者（親A）の userId（createdByRole: parent）
   - 親Aが作ったテスト期間・空白期間の名前、対象外アプリ、制限する Web サイト、通常上限
   - 親Aと紐づいていたときの利用記録（日付・分数・アプリ名）と、端末のアプリ一覧
  端末の許可の状態だけは、外したときに消えている
HTTP status / 相関ID: 200・403 / なし
証拠ファイル: 新 › 「PII-01 親A・子Aが、読める API を全部読んでも、家族Bの id・名前・記録・設定が1つも入らない（自分の家族の分は入る）」（PASS）
  ／新 › 「PII-01 連携を外して別の保護者と紐づけ直しても、前の保護者の id と前の家族のときの設定・記録は、新しい保護者に見えない（期待の形。今は見える）」
  （it.fails。今は穴があるので「失敗するはず」として通る）
影響と再現頻度: 毎回。保護者が子どもを外したあと、その子が別の保護者と紐づけば必ず起きる。前の保護者の内部 id と、前の家族が決めた設定・
  前の家族のときの子どもの利用の様子が、別の家族の保護者に渡る。src/server/auth.ts の unlinkChild に「TODO(未決): 外した子どもの設定・
  利用記録を消すか残すか」とあり、知られている未決事項。少なくとも前の保護者の userId（createdByUserId）は新しい保護者に要らない
```

### PII-02

```text
ケースID: PII-02
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 親A・子A（攻撃側）、家族B（同じ日に別の記録あり）
手順: 親Aの正しい要求をもとに1回ずつ（6回）: usageGet の childId を子Bに／usageGet の日付を 190 日の幅に広げる／
  childAppIconsGet に家族Bのアプリ名（packageName）を混ぜる／configGet（子Aの設定の組）／子Aが子Bの送信 ID で利用記録を送る
期待結果: endpoint ごとに認可し、家族Bの行は返らない。集計からも推定できない
実結果: childId の差し替えは 403。日付を広げても記録のある日は子Aの1日だけで、分数は子Aの分（家族Bの分が足されない）。
  アイコンは子Aのアプリの分だけ。設定の組に家族Bの対象外アプリ・Web サイトは入らない。子Bの送信 ID は 409 で、子Bの中身は返らず子Bの DB は不変
HTTP status / 相関ID: 200・403・409 / なし
証拠ファイル: 新 › 「PII-02 親Aの正しい要求の子の id・日付・送信 ID・アプリ名を家族Bのものに差し替えても、家族Bの行は返らず、集計にも混ざらない」
影響と再現頻度: なし（送信 ID の 409 と 200 の差は API-12 の「気づいたこと」）
```

### PII-03

```text
ケースID: PII-03
判定: PASS（要検討1点）
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 親A・子A。QR の途中の 子C・親C
手順: authMe・linkStatus・familyGet・pairClaim・pairStatus・usageGet・testPeriodList・childAppsGet・deviceStatusGet・configGet の
  応答（10回）の項目の名前を一覧と比べ、どの深さにも内部の列（tokenHash・codeHash・code・payloadHash・submissionId・parentId・
  revokedAt・lastUsedAt・createdAt・provider・subject・email・sessionId など）がないか、QR の番号が入らないかを見る
期待結果: 画面に要る項目だけ。他人の id の一覧を返さない
実結果: どの応答も契約（contracts/schemas.ts）の項目だけ（サーバは応答を契約の形で検査し、余計な項目を落としてから返す）。内部の列の名前、
  QR の番号は出ない。authMe の token は呼んだ本人の合言葉
HTTP status / 相関ID: 200 / なし
証拠ファイル: 新 › 「PII-03 応答は画面に要る項目だけ。合言葉のハッシュ・QR の番号・内部の列（作った時刻・取り消し・送信 ID など）を返さない」
要検討（FAIL ではない）: QR を読んだだけ（子どもが「はい」を押す前）の保護者に、pairClaim の応答で子どもの userId（child.id）が返る。
  画面が使うのは名前だけで、子どもがまだ同意していない相手に内部 id を渡す必要は薄い（その id では何も読めないことは API-04 で確認済み）。
  テスト期間の createdByUserId は、同じ家族の中でだけ見える（家族をまたぐと PII-01 の FAIL）
影響と再現頻度: 低い
```

### PII-07

```text
ケースID: PII-07
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 親A（攻撃側）、家族B
手順: 1回ずつ（7回）: SQL の記号入りの childId（無効な id）／パスの形の pairId／子Bの記録を読む（認可の拒否）／
  DB が止まったとき（プロセスの中の DB の接続を、接続先・合言葉らしき文字・SQL を含む例外を投げるものに差し替える）の health と usageGet／
  DB を戻した後の authMe／最後に使ってから30日を過ぎた合言葉
期待結果: SQL・スタック・環境変数・別ユーザーの情報・合言葉の一部を返さない。エラー文からアカウントの有無を推測しにくい
実結果: 無効な id は 403・404 の決まった文で、送った文字を返さない。認可の拒否は 403 で家族Bの情報なし。DB 停止中は health も
  usageGet も 500 internal の決まった文だけ（接続先・合言葉らしき文字・SQL・表の名前は出ない）。DB を戻すとふつうに使える。
  期限切れは 401 で、合言葉も子Aの id も出ない
HTTP status / 相関ID: 403・404・500・200・401 / なし
証拠ファイル: 新 › 「PII-07 無効な id・認可の拒否・期限切れの合言葉・DB が止まったときの応答に、SQL・スタック・接続先・別の人の情報・合言葉が出ない」
気づいたこと（範囲外）: DB 停止中、サーバの開発ログ（console.error）には例外の文がそのまま出る（接続先などを含みうる）。ログは PII-04 の範囲。
  health は DB 停止中に 503 ではなく 500 を返す（AVL-04 の範囲）
影響と再現頻度: なし
```

### PII-08

```text
ケースID: PII-08
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 親A↔子A・親B↔子B。子A・子Bの呼び名をどちらも「たろう」、アプリ（同じ packageName・名前）と分数（30分）も同じにする
手順: 親A・親Bのそれぞれが familyGet・usageGet（7日）・childAppsGet・linkStatus を読む（8回）
期待結果: 他のユーザーの履歴が混入しない
実結果: どちらの保護者も、家族の一覧は自分の子1人だけ（id で区別）、記録のある日は1日で 30 分・アプリ1つ（2人分の 60 分にならない）、
  アプリ一覧は1つ、つながりは自分の子だけ。相手の子の id は入らない
HTTP status / 相関ID: 200 / なし
証拠ファイル: 新 › 「PII-08 子A・子Bに同じ呼び名・同じアプリ・同じ分数を入れても、親の家族の一覧・利用記録・アプリ一覧に別の家族の分が混ざらない」
影響と再現頻度: なし
```

### PII-09

```text
ケースID: PII-09
判定: FAIL
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 子C・親C・親D・子E・子F（紐づけ前の架空の人）
手順: (1) 子Cが QR を出し、進み具合・読み取り・確定・連携状態を順に呼ぶ（6回）。各応答・DB の pair_tickets の行・サーバのログ（console の全部）に QR の番号が出ないかを見る。
  (2) 出し直した前の QR・使い終わった QR・期限切れの QR・取り消した（「やめる」）QR を読む（5回）。
  (3) 保護者が読んだあと子どもがログアウトし、古い合言葉で確定・取り消し・進み具合（3回）。
  (4) 子どもが QR を出してからログアウトし、保護者がその QR を読む（1回）
期待結果: QR の秘密を再取得・再利用できない。出し直しで古い未使用の QR も無効になる
実結果: (1)(2)(3) は期待どおり（PASS）。番号は発行の応答（pairStart）にだけあり、ほかの応答・ログには出ず、DB はハッシュ（16進64文字）だけ。
  出し直し・使用済み・期限切れ・取り消しの QR は 409。古い合言葉は 401 で、つながりはできない。
  (4) は FAIL。子どもがログアウトしても、出していた QR は期限（10分）まで使える。保護者が読むと 200 で、応答に子どもの userId と呼び名が入る。
  さらに、その子どもがもう一度ログインすると（新しい合言葉で）、前に出していた QR をそのまま確定でき、連携が成立する
  （調べるときに一度だけ確かめた。テストには期待の形だけを残している）
HTTP status / 相関ID: 200・409・401 / なし
証拠ファイル: 新 › 「PII-09 QR の番号は発行の応答にだけ出て、進み具合・読み取り・確定の応答、DB、サーバのログに出ない」
  ／新 › 「PII-09 出し直した前の QR・期限切れの QR・使い終わった QR・取り消した QR は、どれも読めない」
  ／新 › 「PII-09 ログアウトした古い合言葉では、出していた QR の確定・取り消し・進み具合の確認ができない」
  ／新 › 「PII-09 子どもがログアウトしたら、出していた QR はもう読めない（期待の形。今は 200 で読めてしまう）」（it.fails）
影響と再現頻度: 毎回（ログアウトから10分の間）。ログアウトの処理（src/server/auth.ts の signOut）は合言葉だけを無効にし、その人が出した QR は
  無効にしない。画面に残った QR・写真に撮られた QR を、ログアウト後に別の保護者が読むと、子どもの呼び名と userId が渡る。
  連携まで進むには子どもがもう一度ログインして「はい」を押す必要があるので、勝手に家族にされることはない。重さは低〜中
```

### IPA-01

```text
ケースID: IPA-01
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 合言葉なし。家族A・家族Bのデータあり
手順: 合言葉なしで planGet に、子Aの id／ない uuid／形の違う id／子Bの id を1回ずつ送り、status・本文・エラーの形を比べる（4回）。
  画面が呼ぶ API（契約の表の全部）への合言葉なしの呼び出しは API-01・API-08
期待結果: 保護データを一切返さない。エラーから id の有無や権限を推測できない
実結果: 4回とも 401 で本文はまったく同じ。家族A・Bのどの値も入らない
HTTP status / 相関ID: 401 / なし
証拠ファイル: 新 › 「IPA-01 合言葉なしで、自分で作った id・ない id・形の違う id・別の家族の id を送っても、401 の本文と大きさが同じ」、API-01・API-08 の証拠
影響と再現頻度: なし
```

### IPA-02

```text
ケースID: IPA-02
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 子A・親A（攻撃側）、家族B
手順: 子Aが本文の childId を子Bに、role・userId も家族Bの値にして excludedAppsGet・usageUpload・testPeriodCreate を送る。
  親Aが childId を子Bに、parentId・userId を親Bに、role: parent にして planGet・usualLimitSave を送る（5回）
期待結果: 合言葉の本人と親子関係をサーバで確かめ、拒否のあとも子Bのデータは取得・変更されない
実結果: 5回とも 403 forbidden。応答に家族Bの値は入らず、家族A・家族Bの DB は不変
HTTP status / 相関ID: 403 / なし
証拠ファイル: 新 › 「IPA-02 子Aが本文の childId と role を家族Bの値に、親Aが childId・parentId・role を家族Bの値にして送っても 403 で、両家族のデータは変わらない」、API-04〜07 の証拠
影響と再現頻度: なし
```

### IPA-03

```text
ケースID: IPA-03
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 親A（1台目）と親Aの2台目
手順: 2台目で子Aの記録を読む（200）→ 2台目でログアウト → ログアウト前と同じ読む要求（usageGet）と書く要求（usualLimitSave）を再送 →
  もう一度ログインして新しい合言葉で authMe → 古い合言葉で authMe → 30日を過ぎてから新しい合言葉で authMe（7回）
期待結果: ログアウト済み・期限切れの合言葉は拒否され、以前の情報を表示・更新できない。エラーに合言葉や検証の情報を含めない
実結果: 再送はどちらも 401 で、子Aの記録・送った合言葉は入らず、DB は不変（通常上限は変わらない）。もう一度のログインは別の合言葉で 200、
  古い合言葉は 401 のまま。30日を過ぎると 401
HTTP status / 相関ID: 200・401 / なし
証拠ファイル: 新 › 「IPA-03 ログアウトの前の要求（読む・書く）を再送すると 401 で、前の情報を返さず、何も変わらない。期限切れ・もう一度のログインも確かめる」
  ／tests/verify/revoke-and-limit.test.ts（ログアウト・ほかの端末からのログアウト）
範囲外: 端末の保存場所・戻る操作・アプリの再起動（Android の確認。NET-07・AND-04）
影響と再現頻度: なし
```

### IPA-12

```text
ケースID: IPA-12
判定: PASS
日時: 2026-10-18
接続先: プロセス内・PGlite・MOCK=1（ネットワークなし）
テスト用アカウント役割: 親A・子A
手順: 1回ずつ（19回）: 計画の必須の欠け／文字の分数／通常上限に -1・1.5・1e300・null・配列／テスト期間の名前 121 文字・ない日付（2/30）・
  開始>終了／利用分 -5／送信 ID が uuid でない／ログアウトに未知の項目／本文が [] ・ null・1万段の入れ子／子Aが __proto__・constructor.prototype に
  role: parent を入れて通常上限を保存／そのあと計画の読み取りと health。8MB を超える本文は既存のテストで1回だけ確かめている
期待結果: 不正な入力は安定して 4xx。ローカルのサービスが通常の状態に戻る
実結果: 型・範囲・形の誤りは 400 bad_request（どの項目が違うかの issues つき。例外の文・スタックなし）。__proto__ は 403 で、
  ほかのオブジェクトに role・isAdmin が広がらない。5xx は1つもない。家族Aの DB は不変で、ログアウトに未知の項目を付けた要求ではログアウトしていない。
  そのあとの読み取り・health は 200
HTTP status / 相関ID: 400・403・200 / なし
証拠ファイル: 新 › 「IPA-12 欠け・型違い・境界の外・未知の項目・壊れた JSON・深い入れ子・__proto__ は 4xx で止まり、5xx にならず、DB も変わらず、そのあとも使える」
  ／tests/server/body-limit.test.ts › 「上限を超える本文は、読み込む前に 400 bad_request（利用者向けの文）」
範囲外: 遅延・メモリの変化の観察（プロセスの中のテストでは測っていない）。本文の上限は 8MB（計画の IN-11 の例は 64 KiB。IN-11 の範囲）
影響と再現頻度: なし
```

## 見つかった穴（FAIL）のまとめ

| ケース | 何が起きるか | 起きる条件 | 重さの目安 | 関係するコード |
|---|---|---|---|---|
| PII-01 | 別の保護者と紐づけ直した子どもについて、新しい保護者に、前の保護者の userId と前の家族の設定・利用記録・アプリ一覧が見える | 保護者が子どもを外し、その子が別の保護者と QR で紐づく | 中（家族をまたいで内部 id と子どもの行動の記録が渡る） | `src/server/auth.ts` の `unlinkChild`（TODO(未決)）、`src/server/services/test-periods.ts` の一覧の `createdByUserId` |
| PII-09 | 子どもがログアウトしても、出していた QR が期限まで読め、読んだ保護者に子どもの userId と呼び名が渡る。子どもがもう一度ログインすれば、その QR のまま確定できる | ログアウトから 10 分の間に、残った QR を読まれる | 低〜中（勝手には連携しないが、名前と id が渡る） | `src/server/auth.ts` の `signOut`（合言葉だけを無効にし、出していた QR は無効にしない） |

どちらも直していない（調べる役のため）。テストは期待の形で書き、`it.fails` にしてある（直すと「失敗するはず」が通らなくなるので、そのときに `it` へ戻す）。

## 実行の記録

- `npx vitest run tests/security-plan/authz.test.ts --maxWorkers=2` → 25 passed・2 expected fail（it.fails の2本。今は穴があるので失敗する。2本を一時的に it に戻して流し、失敗の理由が
  「200 で読めてしまう」「前の保護者の userId が見える」であることを確かめてから it.fails に戻した）
- 関係する既存のテスト: `npx vitest run tests/verify tests/server/api.test.ts tests/server/body-limit.test.ts tests/server/auth-pair-persistence.test.ts tests/server/device-status.test.ts --maxWorkers=2` → 12 ファイル・202 件すべて通過
- `npm run lint`・`npm run typecheck` → 通過
