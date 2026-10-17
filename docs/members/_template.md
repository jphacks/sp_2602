# <id> — <役割>

## 人間向け（最初に読む）
- ミッション: （このスライスが DEMO.md のどこを成立させるか 1文）
- 担当の場所: （自分が主に作るフォルダ・ファイル）
- 動作確認: Android 16 の実機（またはエミュレータ）をつなぎ、`.env` を MOCK=1 にして `npm run dev:server`（API）と `npm run android`（アプリを実機に入れて起動）を動かし、自分の画面を開く。見た目は `npm run shot`（adb で画面を撮る）で確かめる。API だけなら `npm run api -- <契約名>`
- 分担の型: アプリ（TypeScript・Expo。画面と共通処理）／ Kotlin（Android 固有の処理。`modules/kit-native/`）／ API（Hono。`src/server/`）のどれを持つかを、担当の場所に書く
- 詰まったら: 30分で解決しなければまとめ役（lead）に声をかける / `blocked` Issue。契約・API のことは lead へ

## 触らないファイル（よく間違えるもの）
- contracts/ 全部（変えたい時は change-request Issue）
- 他メンバーの画面フォルダ・`modules/kit-native/` の他人の部分・`src/server/` の他人の機能（直したい時は担当者に Issue）

## ステップ（1つ = 30〜60分 = AIへの1回の依頼 = 1PR）
印は付けない。完了は「マージ済み PR のブランチ名 `<自分のid>/S<番号>-…`」から自動で判定され、`npm run now` に ✓ / …（マージ待ち）/ ・（未着手）で出る。

- S1 <名前> — demo D? — 完了確認: `<コマンド>`
- S2 <名前> — demo D? — 完了確認: `<コマンド>`

## 追記（同期点での変更）
（まとめ役が同期点の決定をここに追記する。上のステップ本体は書き換えない）
