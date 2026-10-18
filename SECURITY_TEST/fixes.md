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
| F-2 PII-10・F-5 AVL-01・F-7 IPA-15・X-1 | 未対応 | 範囲を確かめてから |

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
