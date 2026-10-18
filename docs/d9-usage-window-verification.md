# D9 制限解除時間帯と Android 利用時間の検証

更新日: 2026-10-18
基点: `main` `9883d2b` から作成した `feature/d9-usage-window-validation`
目的: DB・API・画面を変更せず、Android の使用イベントから前面利用区間を再構成し、解除時間との重複をミリ秒で計算できるか検証する。

## 実装した検証用処理

- `UsageReader` は従来どおり `UsageStatsManager.queryEvents()` からイベントを読み、既存の日別結果を返す。
- `ForegroundTime.compute()` は従来の `msByPackage` と `foregroundAtEnd` に加え、日付窓 `[start, end)` に切り詰めた `intervalsByPackage` を返す。既存の合計時間は区間の長さを足して算出するため、同じイベント列なら従来のミリ秒合計と一致する。
- `UsageWindowCalculator` は制限対象パッケージだけを対象にし、利用区間・解除区間を日付窓へ切り詰めて重複区間を結合する。そのうえで `U = actualMs`、`X = releasedMs`、`C = max(0, U - X)` を計算する。解除区間が重なっても重複分を二重計上しない。
- 解除区間は絶対時刻のミリ秒で渡す。D9 のローカル時刻設定を実際の日時へ展開する規則はまだ決めず、D9 の保存仕様も追加していない。
- `getDailyUsage()` の型・戻り値、DB/API、画面、C10 の計算式は変更していない。

## 単体テストで確認するケース

| ケース | 確認内容 |
|---|---|
| 8:30–10:30 の利用、9:00–11:00 の解除 | U=120分、X=90分、C=30分 |
| 解除なし／重なりなし | X=0、C=U |
| 利用が解除内に全て含まれる | X=U、C=0 |
| 解除区間が複数かつ重複 | 解除区間の和集合だけを X に計上 |
| JST 0:00 をまたぐ利用・解除 | `DayWindow` の日付窓で切り詰める |
| アプリ切替 | 前のアプリを次の `RESUMED` 時刻で閉じ、アプリ別区間を返す |
| `STOPPED`、画面消灯 | 取得できた終了イベントで利用区間を閉じる |
| `PAUSED`/`STOPPED` の欠損 | 次のアプリイベントがあればそこで閉じる。後続イベントも無い場合は実際の終了時刻を復元できない |
| 使用状況イベント値 | `DEVICE_SHUTDOWN=17`、`SCREEN_NON_INTERACTIVE=16`、`ACTIVITY_STOPPED=23` を使う |
| 対象外アプリ | 計算へ渡した制限対象パッケージだけ U/X に含める |
| 既存集計との比較 | 生のミリ秒合計は前面区間の合計と一致する。分換算は後述の丸め差を確認する |

## 既存 `getDailyUsage()` との比較

解除時間を空にした新計算の `actualMs` は、制限対象アプリについて `ForegroundTime.compute().msByPackage` を合計した値と一致する。日別の前面区間から作ったため、秒・ミリ秒単位の U の再構成は可能。

分単位の既存表示は各アプリの時間を `ForegroundTime.toMinutes()` で0.1分単位に丸めてから、JS の `restrictedMinutes()` が足す。一方、新計算はアプリ間のミリ秒を合計してから同じ丸めを行う。この違いで、例として各20秒の利用が2アプリにある場合、既存合計は0.6分、新 U は0.7分になる。これは丸め位置による差であり、既存集計の挙動を変えないためこのブランチでは統一しない。D9 を実装する前に、C3/C4/D4 で使う丸め単位をチームで決める必要がある。

## Android 側の制約と実機確認

- `UsageStatsManager.queryEvents()` は `PACKAGE_USAGE_STATS` の使用状況アクセスを必要とする。イベント履歴は「数日分」だけ保持され、固定の日数は API で保証されない。現在の `UsageReader.RETENTION_DAYS = 6` は実機で確認された保証値ではない。
- Android 11（R）以降、端末がロック中でユーザーがアンロックされていないと `queryEvents()` が `null` を返し得る。コードはこれを `unavailable` にする。権限が無い場合は従来どおり `permission_denied`。権限があるのにイベント一覧が空の場合は、「本当に未使用」と「OS/OEMがイベントを返さなかった」をこの API だけで区別できない。
- `ACTIVITY_RESUMED`/`PAUSED` は Activity のライフサイクルイベント。1アプリ内の画面切替は区間を維持するが、画面分割では同時に見える複数アプリの実時間をこの単一前面モデルで別々に測らない。
- イベント欠損で終了イベントが失われ、後続イベントも無い場合、実際の終了時刻は復元できず、照会窓の終端まで前面だったものとして数える。現在の `LOOKBACK_MS=3時間` より前に開始したまま0時を越えた区間も、0時時点のアプリを特定できない可能性がある。
- この作業環境では `emulator-5556`（汎用 x86_64 Android Emulator）は接続されているが、Galaxy 実機は確認できていない。端末上の `UsageStatsManager` イベント取得、権限画面、実利用との差の動的検査は未実施とし、実機未検証として扱う。
- 接続された Emulator は `sdk_gphone64_x86_64`、Android 17 / API 37。JVM 単体テストは実行したが、Emulator でのアプリ起動や `UsageStatsManager` の動的検査は未実施。
- 実機での誤差、Samsung 独自のイベント保持・省電力挙動は未確定。

## 実行結果

- `npm run test -- --reporter=dot`: **66 test files, 873 tests passed**。
- 追跡済み JS/TS/JSON 等443ファイルへの Biome lint: errors なし（2 warnings）。
- `npm run check`: **失敗**。最初の Biome lint が未追跡 `SECURITY_TEST/results/` 内の既存スクリプトで32 errorsを検出したため、複合コマンドは型チェックへ進まなかった。
- `npm run typecheck` を単独実行: **失敗**。`backend/node_modules/drizzle-orm` とルートの `node_modules/drizzle-orm` の型が別宣言として扱われ、`scripts/seed-demo.ts`・DBコード等で型不一致が出る。この作業では依存ツリーや型を変更していない。
- `:kit-native:testDebugUnitTest`: **成功**。Android Studio 同梱 JBR 25 と Gradle 9.4.1 を使い、追加した Kotlin テスト11件を含むタスクが `BUILD SUCCESSFUL` で完了した。初回のGradle構築に約16分かかった。Kotlin daemon の一時ファイル権限エラーが出たが、Gradle の fallback コンパイルでテストは成功した。

## D4・D9 に保存する最小データ案（次段階の提案）

このブランチでは DB/API に反映しない。

- **D4 利用実績:** 子どもID、JST の対象日、アプリ package 名、各前面区間の開始・終了 instant（UTC epoch millis または UTC timestamp）、計測時刻、取得状態。日別合計だけでは後から D9 を適用・変更して X を再計算できない。個人の行動履歴なので保存期間と削除条件も必要。
- **D9 解除設定:** 子どもID、開始・終了のローカル時刻、適用曜日または有効日、`Asia/Tokyo` の timezone ID、有効期間、版。区間は `[start, end)` とし、日付をまたぐ設定の意味、開始時刻と終了時刻が同じ場合の意味、曜日・日付の選択方法は仕様決定が必要。展開後の instant を日別 D4 区間へ重ね、重複は和集合で扱う。
- 計算結果は D4 の raw duration を基に `U/X/C` を算出できる。DB/API の契約を決める段階では、D9変更を過去日に遡及するか、計測後に固定するかも合意する。

## 参照

- [Android `UsageStatsManager.queryEvents()` API](https://developer.android.com/reference/android/app/usage/UsageStatsManager#queryEvents(long,long))
- [Android `UsageEvents.Event` API](https://developer.android.com/reference/android/app/usage/UsageEvents.Event)
