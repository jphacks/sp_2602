# front-a — 機能Aの画面＋デザイン（Figma）＋発表（DEMO.md・資料・紹介動画・通しの確認）

## 人間向け（最初に読む）
- ミッション: アプリ全体の見た目を決め、機能Aの画面で DEMO.md の流れが通り、それを発表で伝えられる状態にする
- 所有ファイル: kit.config.json の owns（ここ以外は触らない）。機能A の画面フォルダ（キックオフで画面 id に書き換え）・`docs/design/`・`docs/DEMO.md`・`docs/pitch/`・`tests/e2e/`
- 動作確認: `npm run dev`（.env は MOCK=1）で http://localhost:3000 の自分の画面を開く。見た目は `npm run shot` で撮って確かめる（スマホ幅 375px）
- 詰まったら: 30分で解決しなければまとめ役（front-b）に声をかける / `blocked` Issue。契約・API のことは lead へ

## デザイン（Figma）
- まず **全体の雰囲気のモック**（主要な1〜2画面＋色・文字・角丸・余白の案）を作る。30〜60分で、画面担当が作り始める前に出す。
- 時間があれば、DEMO.md で見せる画面から **作り込んだデザイン** にする（ボタン・入力欄など共通部品の形も）。全部の画面を作り込まなくてよい。
- 色・文字・角丸は `contracts/tokens.css` の名前で決める（Tailwind のクラスになる）。値の案は change-request で lead に渡し、lead が tokens.css に入れる（契約凍結まで）。
- Figma の URL と、画面ごとの書き出し画像は `docs/design/` に置く（README.md に URL・どの画面がどこまで作り込み済みか）。front-b（共通部品）と front-a・front-b の画面はこれに合わせる。AI に読ませるときは Figma の MCP か書き出し画像を使う。

## 触らないファイル（よく間違えるもの）
- contracts/ 全部（変えたい時は change-request Issue）
- 機能B の画面フォルダ（front-b）、共通部品 `src/components/`（front-b。欲しい部品は Issue で依頼）

## ステップ（1つ = 30〜60分 = AIへの1回の依頼 = 1PR）
印は付けない。完了は「マージ済み PR のブランチ名 `<自分のid>/S<番号>-…`」から自動で判定され、`npm run now` に ✓ / …（マージ待ち）/ ・（未着手）で出る。

- S1 DEMO.md の下書き（課題1文・数字・台本。lead と合意して契約凍結と同時に凍結） — 完了確認: `npm run check`
- S2 Figma で全体の雰囲気のモックを作り、`docs/design/` に URL と書き出し画像を置く。色・文字・角丸の案を change-request で lead に渡す — 完了確認: `npm run check`
- S3 機能A の画面を tokens.css とデザインどおりに組む（`npm run shot` で撮って Figma と見比べる） — 完了確認: `npm run check`
- S4 機能A の画面をサーバとつなぐ（`call()` / `stream()`）。待ち時間とエラーの表示（screens.md の UX の約束） — 完了確認: `npm run check`
- S5 DEMO.md どおりに main を通しで操作して問題を Issue に。発表資料と紹介動画（`docs/pitch/`） — 完了確認: `npm run check`

## 追記（同期点での変更）
（まとめ役が同期点の決定をここに追記する。上のステップ本体は書き換えない）
