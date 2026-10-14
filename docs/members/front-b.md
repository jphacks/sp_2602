# front-b — 機能Bの画面＋共通部品

## 人間向け（最初に読む）
- ミッション: 機能Bの画面を作り、全画面で使う部品（ボタン・入力欄・読み込み表示など）をそろえる
- 所有ファイル: kit.config.json の owns（ここ以外は触らない）。機能B の画面フォルダ（キックオフで画面 id に書き換え）・共通部品 `src/components/`
- 動作確認: `npm run dev`（.env は MOCK=1）で http://localhost:3000 の自分の画面を開く。見た目は `npm run shot` で撮って確かめる（スマホ幅 375px と PC 幅）
- 詰まったら: 30分で解決しなければ lead に声をかける / `blocked` Issue

## 触らないファイル（よく間違えるもの）
- contracts/ 全部（色・角丸・書体の `tokens.css` も。変えたい時は change-request Issue）
- 機能A の画面フォルダ（front-a）

## ステップ（1つ = 30〜60分 = AIへの1回の依頼 = 1PR）
印は付けない。完了は「マージ済み PR のブランチ名 `<自分のid>/S<番号>-…`」から自動で判定され、`npm run now` に ✓ / …（マージ待ち）/ ・（未着手）で出る。

- S1 共通部品を `src/components/ui/` に作る（ボタン・入力欄・読み込み表示・エラー表示。front-a が最初に使うものから） — 完了確認: `npm run check`
- S2 機能B の画面を tokens.css と共通部品で組む — 完了確認: `npm run check`
- S3 機能B の画面をサーバとつなぐ（`call()` / `stream()`）。待ち時間とエラーの表示 — 完了確認: `npm run check`
- S4 全画面をスマホ幅と PC 幅で撮って見た目をそろえる（`npm run shot`） — 完了確認: `npm run check`

## 追記（同期点での変更）
（lead が同期点の決定をここに追記する。上のステップ本体は書き換えない）
