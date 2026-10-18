# セキュリティテストの不合格への対応

対応日: 2026-10-18　ブランチ: `feature/d9-usage-window-validation`
元の結果: [`result.md`](result.md)・セキュリティ担当者向けの暫定共有（4件）

| 指摘 | 状態 | 直したこと |
|---|---|---|
| F-1 PII-05 / AND-05 / IPA-13 合言葉の平文保存（P0） | 修正（実機の確認待ち） | 下の 1 |
| IN-04 / IPA-12 極端な日付で usageGet が応答しない（P1） | 修正 | 下の 2 |
| F-6 IN-04 テスト期間・空白期間に 0001・9999 年が入る | 修正 | 下の 2（同じ直し方） |
| AVL-04 DB の障害で health が 500 | 修正 | 下の 3 |
| F-3 IN-06 NUL 文字で 500 | 修正 | 下の 4 |
| F-4 IN-12 エラーのログに入力が出る | 修正 | 下の 4 |
| IPA-11 依存の既知の脆弱性 | 一部修正・残りは受け入れ | 下の 5 |
| X-1 読むだけで設定の版が上がる | 修正 | 下の X-1 |
| F-2 PII-10 連携を外したあと、別の保護者に前の家庭のデータが見える（高） | 修正 | 下の F-2 / F-7 |
| F-7 IPA-15 連携を外す操作の監査記録がない | 修正 | 下の F-2 / F-7 |
| F-5 AVL-01 ログイン・QR の発行に回数の上限がない | 修正 | 下の F-5 |
| M-1〜M-7 main へ入れる前の点検で見つけたもの | 修正 | 下の「main へ入れる前の点検」 |

## 1. 合言葉の平文保存（F-1）

- Kotlin に `SecretBox`（`modules/kit-native/android/.../engine/SecretBox.kt`）を足した。Android Keystore の AES-256-GCM の鍵で封をする（鍵は端末から取り出せない）。形は `"sb1:" + Base64(IV 12 バイト + 暗号文)`。
- Kotlin の `EngineStore`: 合言葉は `report_token_sealed` に封をして置く。古い版の平文 `report_token` は、読んだときに封をし直して消す。封ができないときは置かずに送るのをやめる。
- JS: `KitNative.sealSecret` / `openSecret` を足し、`src/lib/session-store.ts` で Session（合言葉を含む）を `{"v":1,"sealed":"sb1:…"}` の形で AsyncStorage に置く。古い平文の Session は読んだときに封をし直して上書きする。封ができない（Kotlin がない）ときは置かない（アプリを閉じるとログインし直し）。開けない（鍵が作り直された）ときは消してログインし直し。
- ログアウト・401 で消える流れは前と同じ。
- **確認待ち**: 実機（dev client を作り直す必要あり）で、ログイン後の `RKStorage`・`slope_engine.xml` に合言葉の印が出ないこと、古い版からの更新で平文が消えること、監視の通告（D-113）がアプリを閉じても届くこと。JVM では Keystore が動かないので、SecretBox の単体テストはない。
- 限界: SQLite（RKStorage）は上書きした古いページの中身がファイルの空き領域に残ることがある。古い版から更新した端末では、一度ログアウトしてログインし直すと確実。

## 2. 極端な日付（IN-04 / F-6）

- 原因: `contracts/dates.ts` の `datesInRange` が日付の文字列を比べながら1日ずつ進めていた。`9999-12-31` の翌日は `"+010000-01"` になり、`"9999-12-31"` より小さいと比べられ、しかも次の日もまた `"+010000-01"` に戻るので、終わらない繰り返しになった。
- 契約の `IsoDate` は 2000〜2099 年だけを受け付ける（範囲外は 400）。すべての日付の入力（利用記録・テスト期間・空白期間・計画）に効く。
- `datesInRange` は日数を数えて作る（逆の範囲・読めない日付は空、36,600 日を超えたら例外）。
- テスト: `tests/lib/dates-range.test.ts`、`tests/verify/usage-growth.test.ts` の IN-04。

## 3. DB の障害（AVL-04）

- 新しいエラーの種類 `unavailable`（503。`contracts/errors.ts`）。古い版のアプリは知らない種類を `internal` として扱うので、送り直しの動きは変わらない。
- DB につながらないエラー（SQLSTATE 08xxx・57P01〜57P03・53300、ECONNREFUSED などの通信のエラー、閉じた PGlite、DB を開けなかった）は、どの API でも 503。`/api/health` も 503。
- 手元の DB（PGlite）が閉じていたら、次の呼び出しで開き直す（Neon は接続の池が自分で張り直す）。
- テスト: `tests/server/db-unavailable.test.ts`（閉じる → 開き直して 200、開けない間は 503、開ければ 200 に戻る）。

## 4. NUL 文字とエラーのログ（F-3 / F-4）

- `PackageName` は Android のパッケージ名の形（英数字・`_` を `.` でつなぐ）だけ。
- API の入口（`src/server/route.ts`）で、どの項目の文字列にでも NUL があれば 400。
- サーバのエラーのログは `describeError` でエラーの種類・コード・場所の行だけを出す。message（Drizzle の SQL と params = 利用者の入力・利用者 ID）は出さない。
- テスト: `tests/server/input-safety.test.ts`。

## 5. 依存の脆弱性（IPA-11）

| 指摘 | つながり | APK・サーバに入るか | 対応 |
|---|---|---|---|
| uuid 7.0.3（GHSA-w5hq） | expo → @expo/config-plugins → xcode | 入らない（prebuild の iOS の書き換えだけ。`v4()` を引数なしで使う） | `overrides` で 11.1.1 |
| esbuild 0.18.20（GHSA-67mh） | drizzle-kit → @esbuild-kit/core-utils | 入らない（開発の道具。`serve` を使わない） | `overrides` で 0.25.12 |
| braces 3.0.3（GHSA-vfj7） | expo → @expo/metro → micromatch | 入らない（Metro のビルドだけ。パターンは自分たちの設定） | 直った版がない。受け入れ。出たら override |
| node-forge 1.4.0（GHSA-86w9） | expo → @expo/cli | 入らない（CLI の中だけ。expo-updates のコード署名は使っていない） | 直った版がない。受け入れ。出たら override |

- `npm audit` は 32 件（high 21・moderate 11）→ 21 件（high 21・moderate 0）。残りはすべて braces と node-forge が元で、それを含む expo・metro などに同じ指摘が連なって数えられている。`audit fix --force` の案（expo 44・react-native 0.72 への格下げ）は使わない。
- 直接の依存の版は変えていない。`backend/` は 0 件のまま。
- 未確認: `npm run db:generate` / `db:migrate` を esbuild 0.25 で走らせてはいない（drizzle-kit のコードは esbuild-kit を参照していない）。Android の Gradle の依存の監査は未実施。

## X-1. 読むだけで設定の版が上がる

- 原因: `topUpDailyLimits`（`backend/src/db/c10-recalculate.ts`）は「保存してある最後の日」がしきい値（今日 + 60 日）より前なら作り足して版を上げていた。空白期間だけで通常上限も計画もない子どもは、空白期間の後ろの日が「上限未設定」（一覧に入らない）なので、作り直しても最後の日は空白期間の終わりのまま。毎回しきい値に届かず、`configGet` のたびに同じ中身で版が上がっていた（計画はあるが通常上限がなく、最後のテストが近い子どもも同じ）。
- 直し方: `recalculateC10InTransaction` に `onlyIfChanged` を足し、作り直した結果が前の版と同じ（日付・種類・分・空白期間）なら保存せず false を返す。`topUpDailyLimits` は保存したときだけ版を上げる。D-54 の「中身が変わったときだけ版を 1 上げる」のとおり。設定を保存するときの再計算はこれまでどおり毎回保存する。
- テスト: `tests/server/topup.test.ts` の X-1（空白期間だけの子どもで `configGet` を何度呼んでも版は 1 のまま。日がたっても同じ）。作り足したときに版が上がるのは同じファイルの既存のテストで確かめている。

## F-2 / F-7. 連携を外したあとのデータと、外した記録（PII-10 / IPA-15）

- 直し方（F-2）: `unlinkChild`（`src/server/auth.ts`）が、連携の行を消すのと同じトランザクションで、子どもの家庭ごとのデータを消す（`backend/src/db/family-unlink.ts` の `clearChildFamilyData`）。消す表: 利用記録（`usage_records`・`usage_day_reports`・`usage_sync_batches`）、1日の上限（`daily_limits`・`plan_calculation_versions`）、計画・通常上限（`plan_settings`・`child_usual_limits`）、テスト期間・空白期間、対象外アプリ（`excluded_apps`・`removed_excluded_apps`・`excluded_app_states`）、Web サイト（`blocked_sites`・`blocked_site_states`）、アプリ一覧とアイコン（`child_app_lists`・`child_app_list_items`・`child_app_icons`）、端末の許可の状態（`device_statuses`）。`src/server/auth.ts` の TODO はこれで閉じた。
- 消さないもの: 利用者の行（`users`）・ログインの紐づけ（`auth_identities`）・QR の記録（`pair_tickets`。関わった人しか読めない）・取り消した合言葉の行。家庭のデータではないため。
- 設定の版（`child_config_versions`）は消さずに 1 上げる（0 に戻すと、端末が持っている前の版より小さくなり、次の家庭の設定を取り込まないおそれがある）。子どもの端末が取り込んだ版（`child_applied_versions`）は数だけなので残す。
- 同じ保護者と紐づけ直しても、設定は最初からになる（前は「続きから使えるように」残していた。open-questions.md の `unlinkChild` の項目を決めた）。
- 直し方（F-7）: 新しい表 `audit_events`（migration `0016_family_unlink_audit.sql`）に、`action = "family_unlink"`・`actor_user_id`（外した保護者）・`child_id`・`created_at` を、外すのと同じトランザクションで1行書く。消したデータの中身は残さない。外せなかったとき（403・not_found）は書かない。読む API・画面はまだない（DB を見る）。
- テスト: `tests/verify/unlink-data.test.ts`（result.md の手順どおり: 子C が C1 とデータを作る → C1 が外す → 子C が C2 と連携 → C2 の `usageGet`・`testPeriodList`・空白期間・計画・対象外アプリ・Web サイト・アプリ一覧とアイコン・端末の状態・子どもの `configGet` に前の家庭のデータが出ない。版は前より大きい。ほかの家庭のデータは消えない。監査の行が1行残り、403 のときは残らない）。
- 残り（2026-10-18 に直した。D-133）: 前は、子どもの端末の送信待ち（`src/lib/usage-outbox.ts`）を 401 では消さなかった（同じ人がログインし直して送れるように）ので、外された時点で送れていなかった今日・昨日の分が、別の保護者と紐づけ直したあとに送られて、新しい保護者に見えることがあった。今は、外すときに子どもの合言葉を理由 `family_unlink` で無効にし（`user_sessions.revoked_reason`。migration `0018_session_revoked_reason.sql`）、その合言葉で呼ばれたら 401 に `reason: "family_unlink"` を付ける。子どもの端末はそれを見て、送信待ち・設定のキャッシュを消し、端末の制限も止める（`src/lib/session-core.ts` の `expire`・Kotlin の `StatusReporter`）。期限切れなど理由のない 401 では今までどおり消さない。テスト: `tests/verify/unlink-notice.test.ts`・`tests/lib/session-core.test.ts` › 「session-core: 401 の理由（D-133）」。

## F-5. ログイン・QR の発行の回数の上限（AVL-01）

- 直し方: `src/server/rate-limit.ts` の `countCall`。窓の間に同じ相手から上限の回数を呼ばれたら、その間は `rate_limited`（429。ApiError の形）。断った呼び出しは数えないので、窓が過ぎればまた受け付ける。
- 数は DB の新しい表 `rate_limit_hits`（migration `0017_rate_limit_hits.sql`）に残す。Vercel のインスタンスはメモリを共有しないため（`pairClaim` の `pair_claim_failures` と同じ考え）。相手（IP・subject・利用者 id）は SHA-256 にして残し、IP をそのまま置かない。窓を過ぎた行は数えるときに消す。
- 上限:
  - `authGoogle`: IP ごとに 1 分 20 回（Google の確認より先に数える。家庭・学校では保護者と子どもの端末が同じ IP になるので多め）。同じ人（Google の sub・MOCK の idToken）ごとに 1 分 10 回。
  - `pairStart`: 1 人 1 分 5 回（1 回ごとに `pair_tickets` へ行を書くため。QR は 10 分使えるので、ふつうは 1 回で足りる）。
- IP は Vercel が付ける `x-real-ip`・`x-forwarded-for` の先頭（Vercel は利用者が送った値を上書きする）。ヘッダがない手元のサーバ・テストでは IP ごとの上限は数えず、人ごとの上限だけが効く。
- 自分の行を先に足してから、自分を含めて窓の中の件数を数え、上限を超えていたら自分の行を消して 429（下の M-2）。同時に届いても通るのは上限まで。ちょうど同時に上限を超える数が届くと、多めに断ることがある（安全側）。
- 限界: 監査ログ（AVL-01 の期待結果）は出していない。
- テスト: `tests/verify/revoke-and-limit.test.ts` の F-5（pairStart は 5 回の次が 429・ほかの子どもは止まらない・1 分たてば出せる。authGoogle は同じ人 10 回の次が 429・ほかの人は止まらない・1 分たてば入れる。同じ IP 20 回の次が 429・ほかの IP は止まらない・通らない idToken でも数える）。`tests/verify/security.test.ts` の「QR の code を 20 回出す」は、上限にかからないように 12 秒ずつ時計を進めるようにした。

## main へ入れる前の点検（M-1〜M-7）

main へ入れる前に、このブランチの差分（`origin/main...HEAD`）を、DB・サーバ・契約・Android・アプリ・文書に分けて読み直した。見つけたものと直し方。

- **M-1 電源断の番号の誤り（動作・重大）**: `ForegroundTime.kt` が `DEVICE_SHUTDOWN` を 17 としていた（D9 の検証のコミットで入った退行）。正しくは 26 で、17 は `KEYGUARD_SHOWN`（android.jar で確認）。電源を切っても区間が閉じず、再起動の後まで前のアプリを使っていたことになっていた。26 に戻し、`UsageEvents.Event` の定数と比べるテストと、電源断で区間が閉じるテストを足した（`UsageWindowCalculatorTest.kt`）。
- **M-2 回数の上限が同時の呼び出しですり抜けた（F-5 の再対応・重大）**: `countCall` が「数える→足す」を別々に行っていたため、同じ子どもの `pairStart` を 30 本同時に送ると上限 5 に対して 30 本とも 200 になった（`authGoogle` も同じ）。上の F-5 のとおり「足してから数える」に変えた。テスト: `tests/verify/revoke-and-limit.test.ts`（`pairStart` 30 本・`authGoogle` の IP 40 本／人 30 本を同時に送り、200 は上限以下）。
- **M-3 ログの「場所の行」に入力が混ざった（F-4 の再対応）**: `describeError` が stack の先頭から `at` の行を拾っていたため、message（Drizzle の params = 利用者の入力）に「改行＋空白＋at」があると、入力がログに出た。stack の中の message より後ろだけから拾い、`\r` も分け、制御文字を除く。元のエラー（cause）の場所も 2 行まで出す（`src/server/errors.ts`）。テスト: `tests/server/input-safety.test.ts`。
- **M-4 DB を開く失敗をすべて 503 にしていた（AVL-04 の再対応）**: `DATABASE_URL` がない・migration の誤りなどの設定ミスまで「一時的に使えない」になり、原因の場所もログに出なかった。接続の失敗だけを 503、それ以外は `DatabaseOpenError` で 500 internal にして元のエラーの種類と場所を出す。失敗した PGlite は閉じてから捨てる（`src/server/db/index.ts`）。`/api/health` は前のまま、開けなければ 503。テスト: `tests/server/db-unavailable.test.ts`。
- **M-5 封ができない端末で、紐づけの直後にログイン画面へ戻された（F-1 の再対応）**: 封ができないと Session を端末に置かないが、`refresh()` が端末の保存しか読まなかった。今の Session をメモリにも持ち、`refresh()` はメモリ→端末の順に読む（平文では置かない）。ログアウト・401 の後にメモリの値で戻らないよう、入れ替わりの回数で遅れて届いた返事を捨てる（`src/lib/session-core.ts`）。古い平文を封し直す書き込みが失敗しても、読めた Session は返す（`session-store.ts`）。テスト: `tests/lib/session-core.test.ts`・`session-store.test.ts`。
- **M-6 Keystore の鍵が壊れると直らなかった（F-1 の再対応）**: `SecretBox.seal` が失敗したら、まず鍵を消さずに 1 回やり直す。それでも失敗し、鍵が壊れていると分かる例外（`InvalidKeyException`・`UnrecoverableKeyException` など）のときだけ、鍵を消して 1 回だけ作り直す（Keystore の一時的な失敗で鍵を消すと、もう一方の封をした値まで開けなくなるため）。`open` の失敗では消さない。失敗は `Log.w` に例外の種類だけ残す。鍵を作り直すと前に封をした値は開けなくなり、JS はログインし直し、Kotlin は次の `setStatusReporter` で封をし直す。**確認待ち**: 実機。
- **M-7 Neon の接続断が 503 にならず、待っている間の切断でプロセスが落ちうる（AVL-04 の再対応）**: Neon（`@neondatabase/serverless`）の切断のエラーは code を持たないので、決まった文（`Connection terminated unexpectedly` など）・undici の `UND_ERR_*`・WebSocket の ErrorEvent も 503 にする（`isDatabaseUnavailable`）。Pool に `error` の受け手がなく、待っている間に Neon が接続を閉じると Node がプロセスごと落とすので、記録だけする受け手を付けた（`src/server/db/index.ts`）。あわせて、ログの場所の行は stack の頭が「種類: message」の形で、すぐ後に続く `at` の行だけを拾う（message を後から書きかえた・stack に書き足した場合も入力を出さない）。`DatabaseOpenError` は中身の SQLSTATE によらず 500。本番で `DATABASE_URL` がないときはログに `DATABASE_URL_MISSING` と出る。テスト: `tests/server/db-unavailable.test.ts`・`input-safety.test.ts`。
- ほか: 429 のときにサーバの hint（「1分ほど待ってから」など）をログイン・子どもの QR・保護者の QR 読み取りの画面に出す。古い dev client（`sealSecret` がない）で動かすと、開発中だけ警告を出す。
- 出す前の作業（`docs/development.md` 8 章）: 0016・0017 をプレビュー・本番へ先に入れる。範囲外の古いデータが残っていないか SQL で確かめる。dev client を作り直す。

### まだ直していないもの

[security/android-security-test-plan](https://github.com/jphacks/sp_2602/tree/security/android-security-test-plan) の SUMMARY.md の FAIL のうち、次の 4 つはこの対応に入っていない。

- AND-12: release 版の JS にデモの決まった合言葉が入る（`src/lib/google.ts` が `contracts/fixtures.ts` を読む）。
- PII-09: 子どもがログアウトしても、出していた QR が使える。
- AND-11: 端末の時計を進めると、上限の日をずらせる。
- AVL-01 の `usageUpload`: 利用記録の送信に回数の上限がない。
