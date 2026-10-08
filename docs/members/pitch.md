# pitch — 発表・デモ台本・E2E確認

## 人間向け（最初に読む）
- ミッション: （このスライスが DEMO.md のどこを成立させるか 1文）
- 所有ファイル: kit.config.json の owns（ここ以外は触らない）
- 動作確認: `npm run dev`（.env は MOCK=1）で http://localhost:3000 の自分の画面を開く。スマホ幅（DevTools の 375px）でも確認
- 詰まったら: 30分で解決しなければ lead に声をかける / `blocked` Issue

## 触らないファイル（よく間違えるもの）
- contracts/ 全部（変えたい時は change-request Issue）
- 他メンバーの画面フォルダ

## ステップ（1つ = 30〜60分 = AIへの1回の依頼 = 1PR）
印は付けない。完了は「マージ済み PR のブランチ名 `<自分のid>/S<番号>-…`」から自動で判定され、`npm run now` に ✓ / …（マージ待ち）/ ・（未着手）で出る。

- S1 DEMO.md の下書き（課題1文・数字・台本） — 完了確認: `npm run check`
- S2 当事者ヒアリングで引用と数字を取る — 完了確認: `npm run check`
- S3 DEMO.md 通りに main を操作して問題を Issue 化 — 完了確認: `npm run check`

## 追記（同期点での変更）
（lead が同期点の決定をここに追記する。上のステップ本体は書き換えない）
