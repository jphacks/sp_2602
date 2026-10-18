# セキュリティ担当者向け・不合格事項の暫定共有

検査日: 2026-10-18。検査対象ソース: `security/android-security-test-plan` / `0ddfc7e`。
対象環境: 専用AVD `SlopeVerify`、Android 17 / API 37、debug APK、ローカルAPI、隔離PGlite、架空アカウントのみ。本番・実OAuth・実ユーザーデータは未使用。

**不合格7項目は、原因・観測事象でまとめると以下の4件です。修正は未実施です。** 優先度は検査計画に沿う暫定値で、CVSS評価ではありません。未完了項目はこの一覧に含めていません。

## 1. 認証トークンの平文保存【優先対応 / P0】

- 対応ID: **PII-05 / AND-05 / IPA-13**（同一問題の重複分類）。
- 再現: 実際のSlopeで架空の親・子としてログインし、AVD内で保存領域を確認。
- 観測: セッショントークンの合成マーカーをSQLite `databases/RKStorage` で検出。子のログイン時は `shared_prefs/slope_engine.xml` にも検出。保存処理のソース確認と合わせ、暗号化なしの保存を確認。
- 影響: 保存領域が取得された場合、Bearerトークンが読める設計。**通常の第三者アプリから取得できたという結果ではない。** 通常shellからDBへのアクセスは拒否された。端末内データ本体・トークン値は証跡へコピーしていない。
- 補足: 親・子のログアウト後、調べた保存領域のトークンマーカーは消失し、旧トークンへのAPI応答は401。子のsession/config/outbox件数も0。ログアウト処理の不具合とは判定していない。
- 対応依頼: JSとKotlin双方の認証秘密を、Android Keystore等に基づく保護方式へ移す。移行時の既存平文の除去、バックグラウンド送信、失効・ログアウトを併せて検証する。
- 証跡: [子ログイン時](android-dynamic/child-signed-in-storage.json)、[子ログアウト後](android-dynamic/child-logged-out-storage.json)、[旧token拒否](android-dynamic/child-token-after-logout.json)、[静的検査](android-static/ANDROID_STATIC_REVIEW.md)。

## 2. 極端な未来日付の利用履歴APIが応答未完了【優先調査 / P1暫定】

- 対応ID: **IN-04 / IPA-12**（同一観測の重複分類）。
- 再現条件: 認証済みの架空アカウントで `POST /api/usage/get` の `from` と `to` をともに `9999-12-31` とする。
- 観測: 隔離runnerを停止するまでHTTP応答が得られなかった。計画の「極端な日付を制限付き4xxで拒否」を満たす証拠が得られなかった。不正形式・存在しない日付・逆転範囲は400。
- 限界: 完了・timeout時刻が保存されていないため、正確な経過秒数は不明。**一般的なDoS、全サービス停止、原因箇所は未確定。** 追加の同一負荷試験は実施していない。
- 対応依頼: 日付の許容年、過去・未来の範囲、走査日数上限を確認。日付計算・DB検索のどこで未完了になるか、隔離した単体検証で切り分ける。
- 証跡: [API結果 IN-04](api/REPORT.md)、[部分実行記録](api/boundary-progress.jsonl)。対象リクエストの完了行がないという証拠の限界を含む。

## 3. アプリAPIのDB障害時health応答が500【P1暫定 / 可用性】

- 対応ID: **AVL-04**。
- 再現: アプリAPIの隔離メモリPGliteを意図的にclose。
- 観測: `/api/health` が計画の503ではなく500。通常の認証付きAPIも汎用500を返した。HTTP応答へのSQL・stack trace露出は観測していない。
- 限界: DBオブジェクトをcloseした局所的な障害注入であり、本番DBの一時切断と同一条件ではない。自動復旧は未検証。
- 区別: **別実装の `backend` の `/health` は、専用PostgreSQL停止時503、再起動後200を確認済み。** 上記不合格はアプリAPI側。
- 対応依頼: healthの契約とデプロイ時の利用先を確認し、障害時status・再接続・復旧監視を整える。
- 証跡: [API結果 AVL-04](api/REPORT.md)、[別backendの正常な障害・復旧結果](android-static/health/HEALTH_CHECK_RESULT.md)。

## 4. アプリ依存関係に既知脆弱性の監査警告【優先度は到達性評価後】

- 対応ID: **IPA-11**。
- 方法: 元のpackage/lockを検査専用ディレクトリへコピーし、`npm audit --package-lock-only --ignore-scripts --json` を実行。元の依存関係は変更していない。
- 観測: root側は **64 affected package entries（high 53 / moderate 11）**。これは**64件の独立した脆弱性ではない**。元アドバイザリは4件。

| 対象バージョン | 監査で報告されたアドバイザリ |
|---|---|
| braces 3.0.3 | GHSA-vfj7-8cjw-p6xm |
| esbuild 0.18.20（入れ子の依存） | GHSA-67mh-4wv8-2f99 |
| node-forge 1.4.0 | GHSA-86w9-cpqp-85rv |
| uuid 7.0.3 | GHSA-w5hq-g745-h8pq |

- 限界: npm監査の検査日時点の結果。開発ツール専用か、APK・サーバーの実行経路へ到達するかは未判定。Android Gradle依存の監査も未完了。別backendのlockは監査警告0だったが、安全性の保証ではない。
- 対応依頼: [監査結果](review/npm-audit-summary.md) のアドバイザリ原文・影響範囲を照合し、直接／間接依存、実行環境、攻撃者入力の到達性で優先順位を決めて更新する。`audit fix --force` による一括変更は未実施。

## 共有時の注意

- この4件は暫定共有。全76項目の検査完了・リリース承認を意味しない。
- 平文保存のP0不合格が未解消のため、検査計画のリリースゲートは満たしていない。
- ここでのAndroid結果はdebug APKによるもの。release APKのTLS・証明書・exported設定等は別途確認が必要。
- 検査手順の逸脱: 初回APIバッチで規定の1 req/s間隔を守れず、oversizeを報告上3回、QR無効入力を合計22回実施した。すべて隔離ローカル。追加の負荷試験は停止済み。詳しくは [統合結果](RESULTS.md) と [API結果](api/REPORT.md) を参照。

追加追試では、期限切れセッション拒否、別家族の履歴拒否、単一の通信失敗記録の再送成功、HTML風文字列の安全な一覧表示を確認したが、上記4件の不合格は未修正のまま。IN-05の追加14要求と既存7要求は累積21要求となり、各ケース20回上限の追加逸脱として記録した。詳細は [端末追試](android-dynamic/FOLLOWUP.md) と [利用分数追試](api-followup/INPUT_MINUTES.md) を参照。


## 追加観測（不合格件数には未算入）

- Androidの最近使ったアプリのプレビューに、ログイン中の子どもの利用分数・上限・権限状態が表示された（ログアウト後はログイン画面へ更新）。また、子のQR表示画面（`MainActivity` `Window#8`）でも `FLAG_SECURE` は設定されていなかった。一方、常駐通知（`MonitorService` ID `2600`）は割合（`"今日は 3% 使いました"`）のみで利用分数・アプリ名・トークン・QRコードの露出はなかった。画面保護（`FLAG_SECURE` 等）を必須にする画面範囲の要件判断が残るため、新規FAILではなく `AND-07` / `PII-06` の要件判断待ち（BLOCKED）として共有する。[初回観測](android-dynamic/POST_RESUME.md)、[QR・通知の追加観測](android-dynamic/POST_RESUME_2.md)。
- QR連携では、UI取消（`pairCancel`）やQR再発行（`pairStart`）で旧QRが即時失効（409）し、直接 `signOut` した場合も子のセッション失効により `pairStatus` / `pairConfirm` が401で拒否されるため連携完了には至らないことを確認した（`PII-09` PASS）。ただし、`signOut` 処理自体は `pairTickets` テーブルの行ステータスを即時 `expired` へ更新しないため、10分TTLまでの間に親が旧QRを `pairClaim` すると200が返る（直後の子側 `pairConfirm` で401停止）。防御の深さとして `signOut` 時に未完了 `pairTickets` も失効させる改善余地がある: [QRライフサイクル証跡](api-followup/qr-lifecycle-evidence.json)。
