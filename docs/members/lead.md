# lead — 統合担当（契約・main・同期点の進行）

## 人間向け（最初に読む）
- ミッション: （このスライスが DEMO.md のどこを成立させるか 1文）
- 所有ファイル: kit.config.json の owns（ここ以外は触らない）
- 動作確認: `npm run dev`（.env は MOCK=1）で http://localhost:3000 の自分の画面を開く。スマホ幅（DevTools の 375px）でも確認
- 詰まったら: 30分で解決しなければ lead に声をかける / `blocked` Issue

## 触らないファイル（よく間違えるもの）
- 各メンバーの画面・サーバのファイル（直したい時は所有者に Issue）

## ステップ（1つ = 30〜60分 = AIへの1回の依頼 = 1PR）
印は付けない。完了は「マージ済み PR のブランチ名 `<自分のid>/S<番号>-…`」から自動で判定され、`npm run now` に ✓ / …（マージ待ち）/ ・（未着手）で出る。

- S1 contracts を確定して凍結（DEMO.md は pitch と合意） — 完了確認: `npm run check`
- S2 GitHub のブランチ保護と CODEOWNERS を確認 — 完了確認: `npm run kit:owners`
- S3 同期点1 を進行（docs/rules/sync.md） — 完了確認: 全員の PR がマージ済み

## 追記（同期点での変更）
（lead が同期点の決定をここに追記する。上のステップ本体は書き換えない）
