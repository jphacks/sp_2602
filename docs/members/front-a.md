# front-a — 機能Aの画面＋発表（DEMO.md・資料・紹介動画・通しの確認）

## 人間向け（最初に読む）
- ミッション: 機能Aの画面で DEMO.md の流れが通り、それを発表で伝えられる状態にする
- 所有ファイル: kit.config.json の owns（ここ以外は触らない）。機能A の画面フォルダ（キックオフで画面 id に書き換え）・`docs/DEMO.md`・`docs/pitch/`・`tests/e2e/`
- 動作確認: `npm run dev`（.env は MOCK=1）で http://localhost:3000 の自分の画面を開く。見た目は `npm run shot` で撮って確かめる（スマホ幅 375px）
- 詰まったら: 30分で解決しなければ lead に声をかける / `blocked` Issue

## 触らないファイル（よく間違えるもの）
- contracts/ 全部（変えたい時は change-request Issue）
- 機能B の画面フォルダ（front-b）、共通部品 `src/components/`（front-b。欲しい部品は Issue で依頼）

## ステップ（1つ = 30〜60分 = AIへの1回の依頼 = 1PR）
印は付けない。完了は「マージ済み PR のブランチ名 `<自分のid>/S<番号>-…`」から自動で判定され、`npm run now` に ✓ / …（マージ待ち）/ ・（未着手）で出る。

- S1 DEMO.md の下書き（課題1文・数字・台本。lead と合意して契約凍結と同時に凍結） — 完了確認: `npm run check`
- S2 機能A の画面を tokens.css で組む — 完了確認: `npm run check`
- S3 機能A の画面をサーバとつなぐ（`call()` / `stream()`）。待ち時間とエラーの表示（screens.md の UX の約束） — 完了確認: `npm run check`
- S4 DEMO.md どおりに main を通しで操作して問題を Issue に。発表資料と紹介動画（`docs/pitch/`） — 完了確認: `npm run check`

## 追記（同期点での変更）
（lead が同期点の決定をここに追記する。上のステップ本体は書き換えない）
