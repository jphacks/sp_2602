# lead — つなぎ役（通信・API・セキュリティ／契約・main）

## 人間向け（最初に読む）
- ミッション: 機能A・B の画面とサーバが、契約（contracts/）どおりにつながって安全に動く状態を保つ
- 所有ファイル: kit.config.json の owns（ここ以外は触らない）。契約・API の共通部分（`src/server/route.ts` / `errors.ts`・`src/lib/api.ts`）・`src/app/api/health/`・`src/proxy.ts`・設定と scripts
- 動作確認: `npm run dev`（.env は MOCK=1）で http://localhost:3000 を開く。API は `npm run api -- <契約名>` で叩く
- 詰まったら: 30分で解決しなければまとめ役（front-b）に声をかける。契約が止まると全員が止まるので、契約の問い合わせは最優先で返す
- チームの組み方とキックオフでの書き換え: docs/rules/team.md

## 触らないファイル（よく間違えるもの）
- 各メンバーの画面・サーバのファイル（直したい時は所有者に Issue）

## セキュリティの約束（この役の担当）
- 入力は契約の Zod で必ず検査される（`handle()` / `handleStream()`）。契約にない入力を受け付ける API を作らない
- キー（`ANTHROPIC_API_KEY`・`DATABASE_URL`）はサーバだけ。`NEXT_PUBLIC_` で始まる変数にしない。画面のコードから `src/server/` を import しない（`server-only` で止まる）
- エラーの中身（例外の文・SQL）を画面に出さない（`route.ts` が `internal` にそろえる）
- AI を呼ぶ API は回数の上限を考える（審査中に連打されても料金が膨らまない）。必要なら `src/proxy.ts` で止める

## ステップ（1つ = 30〜60分 = AIへの1回の依頼 = 1PR）
印は付けない。完了は「マージ済み PR のブランチ名 `<自分のid>/S<番号>-…`」から自動で判定され、`npm run now` に ✓ / …（マージ待ち）/ ・（未着手）で出る。

- S1 `npm run kit:reset` でひな型の例を消し、機能A・B の分け方を kit.config.json に書く（docs/rules/team.md）→ `npm run kit:owners` — 完了確認: `npm run check`
- S2 contracts を確定して凍結（API の path は `/api/<機能>/<名前>`。DEMO.md は front-a と合意）→ `npm run kit:stub` — 完了確認: `npm run check`
- S3 セキュリティの確認（上の約束。キーが画面側に出ていない・AI の API の回数上限） — 完了確認: `npm run check`
- S4 第1統合までに契約と実装のずれを0にする（同期点で採用した change-request を contracts/ に反映） — 完了確認: `npm run check`

## 追記（同期点での変更）
（まとめ役が同期点の決定をここに追記する。上のステップ本体は書き換えない）
