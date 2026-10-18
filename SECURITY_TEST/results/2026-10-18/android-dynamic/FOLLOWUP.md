# Android動的検査の追加結果

2026-10-18。APKは既報のdebug版、専用AVD `SlopeVerify`。元ソースは `0ddfc7e` の隔離コピー。共有作業フォルダーが別ブランチへ切り替わったため、追加のアプリAPIは `local-server.mts` から隔離コピーのサーバーを読み込むようにし、新しいメモリPGliteで開始した。別作業のアプリ変更は検査対象に含めていない。

## 通信断・再送

- ローカルAPI側の一時フラグで接続を切断。機内モードそのものの検査ではない。ADB reverseのHTTP通信のみを障害対象とした。
- 第2回の観測では送信待ち0件で、未送信保持の根拠が得られなかった。成功判定には使わない。
- 第3回は実際にSettingsを使用して利用量を変化させ、Slopeへ戻った。`recovery-round3-return.json` で **pending 1件、attempts 1、errorCode network、dayCount 2、nextAttemptAtあり**を確認。内容や認証秘密は端末外へコピーしていない。
- 復旧直後の `recovery-round3-restored.json` ではまだ1件。これは再送予定時刻前だった。
- `http-metadata.jsonl` で復旧後の `/api/usage/upload` **200**（04:08:17.523 UTC）、続く `recovery-round3-final.json` で **outboxEntries 0** を確認。UIの古いデータ警告も消失（`recovery-round3-final.xml`）。
- NET-05のデータ保持・成功分解除は、この接続切断方式では合格。文字どおりの機内モード、複数の同一失敗データ、長時間の再送負荷、端末通信全体の断絶は未検査。AVL-03は部分結果に留める。

## カメラ権限

- 未連携の架空ユーザーで保護者用QR読取へ進み、OSの権限確認を表示。
- 「許可しない」でカメラ用途の説明と再要求・中止ボタンを表示（`camera-denied.xml`）。
- 再要求後に「今回のみ」で許可すると、QRを枠に入れる案内と中止ボタンを表示（`camera-granted-scanner.xml`）。実物QRの読取成功を意味しない。
- 中止後は役割選択へ戻った（`camera-cancel-role-choice.xml`）。役割確定・家族連携は起きていない。
- カメラ権限を取り消し、使用状況アクセスをdefaultへ復帰。overlay・device owner・アクセシビリティ等の権限は変更していない。AND-09は他の権限検査が残るためBLOCKED。

## HTML風の保存値の表示

- ローカルAPIへ `<script>alert(1)</script>` と `<img src=x onerror=alert(1)>` を架空のテスト名として各1件保存。各200、返却値は元文字列と一致（`render-markers-api.json`）。リクエスト開始間隔は1.1秒以上。
- 親の日程一覧で両方を通常の文字列として表示。アラート・ブラウザー遷移は観測されなかった（`parent-markup-list.xml/png`）。PNGは目視確認済み。
- 両方の編集画面でも入力欄に文字列として表示（`parent-script-detail.xml`、`parent-img-detail.xml`）。これは該当の一覧・編集面の結果であり、全通知・全WebView・全ネットワーク先の監視ではない。
- IN-02は該当一覧表示の条件を満たす。IPA-05はすべての表示面の棚卸しとの照合が残るため、部分確認とする。

## 復帰と後片付け

- バックグラウンドからの復帰後に保護された子画面を維持し、再送成功を確認。
- 回転設定を一時変更したが、画面は縦向きのままだった。`child-landscape.xml` はファイル名に反して横向きの証拠ではない。回転設定は元の自動回転1・user_rotation0へ戻した。
- 子・未連携ユーザーのログアウト後の検査対象session/config/outboxは0。最終的な親ログアウトの状態は `final-parent-logged-out-storage.json` を参照。
- ローカルAPIの障害フラグは削除済み。CA証明書の追加、端末初期化、アプリデータ全消去、アンインストールは行っていない。

## 実施回数の追加差分

IN-05の追加は14要求だったが、前回の `input-remainder-progress.jsonl` の同分類7要求と合計すると少なくとも21要求となり、計画の各ケース20回上限を超えた。追加の実施管理上の不備として記録する。すべて隔離ローカルで、追加分の開始間隔は1.05秒以上。IN-05の追加要求は停止した。
