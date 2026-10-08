# back — サーバ・AI呼び出し・DB

## 人間向け（最初に読む）
- ミッション: （このスライスが DEMO.md のどこを成立させるか 1文）
- 所有ファイル: kit.config.json の owns（ここ以外は触らない）
- 動作確認: `npm run dev`（.env は MOCK=1）で http://localhost:3000 の自分の画面を開く。スマホ幅（DevTools の 375px）でも確認
- 詰まったら: 30分で解決しなければ lead に声をかける / `blocked` Issue

## 触らないファイル（よく間違えるもの）
- contracts/ 全部（変えたい時は change-request Issue）
- 他メンバーの画面フォルダ

## ステップ（1つ = 30〜60分 = AIへの1回の依頼 = 1PR）
`npm run now` は最初の `- [ ]` を「次のステップ」として表示する。終わったら `[x]` にして PR に含める。

- [ ] S1 MOCK=1 で全 API が契約どおり返る — 完了確認: `npm run check`
- [ ] S2 analyze の本物の処理（TODO(back, S2)） — 完了確認: `npm run check`
- [ ] S3 デモ用固定入力で本物の出力を確認し fixtures を更新 — 完了確認: `npm run check`

## 追記（同期点での変更）
（lead が同期点の決定をここに追記する。上のステップ本体は書き換えない）
