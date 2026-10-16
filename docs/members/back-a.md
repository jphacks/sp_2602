# back-a — サーバ全部（機能A・B の処理・AI・DB）

## 人間向け（最初に読む）
- ミッション: （機能A・B が DEMO.md のどこを成立させるか 1文。キックオフで書く）
- 所有ファイル: kit.config.json の owns（ここ以外は触らない）。`src/server/a/`・`src/server/b/`・`src/app/api/a/`・`src/app/api/b/`・`tests/server/a/`・`tests/server/b/`・DB の接続（`src/server/db/index.ts`）。テーブル定義 `src/server/db/schema.ts` も、サーバ担当は1人なので自分だけが足す
- 動作確認: `npm run dev`（.env は MOCK=1）→ `npm run api -- <契約名>` で自分の API を叩く
- 詰まったら: 30分で解決しなければまとめ役（lead）に声をかける / `blocked` Issue。契約・API のことも lead へ
- 1人で機能2つ分なので、**MOCK で両方の API が返る状態を先に作る**（画面の2人が待たずに進められる）。本物の処理は DEMO.md で見せる順に

## 図の担当: データフローチャート（FigJam）
- 流れ: フローチャート（front-b）→ UI（front-a）／データフローチャート（back-a）→ データフローダイアグラム（DFD）と ER図（lead）。全体は docs/rules/team.md「図の流れ」
- 描くもの: 画面の操作ごとに、どの API を呼び、サーバの中で何を確かめ・計算し・保存し、何を返すか（処理の順番と分かれ道。失敗したときの道も）
- 元にするもの: front-b のフローチャート ／ 渡す先: lead（DFD・ER図・契約）。lead の ER図で表の形を合わせてから `src/server/db/schema.ts` に足す
- 置き場所: FigJam（リンクはこの説明書の「追記」か docs/flow/README.md に貼る）。元の Mermaid（図を文で書く形）も残すと AI が読める
- 目安: 契約凍結（11:30）の前に下書き（契約に要る項目を lead に渡す）、同期点1 までに保存（DB のテーブル）まで描く

## 触らないファイル（よく間違えるもの）
- contracts/ 全部（変えたい時は change-request Issue）
- `src/server/route.ts` / `errors.ts`（lead）、画面の本体 `src/app/<画面id>/`（front-b）、部品 `src/components/`（front-a）

## ステップ（1つ = 30〜60分 = AIへの1回の依頼 = 1PR）
印は付けない。完了は「マージ済み PR のブランチ名 `<自分のid>/S<番号>-…`」から自動で判定され、`npm run now` に ✓ / …（マージ待ち）/ ・（未着手）で出る。

- S1 MOCK=1 で機能A・B の API が契約どおり返る（lead の仮の API を置き換える） — 完了確認: `npm run check`
- S2 機能A の本物の処理（`src/server/a/`。外部の失敗は `throw new AppError("upstream_failed")`） — 完了確認: `npm run check`
- S3 機能B の本物の処理（`src/server/b/`） — 完了確認: `npm run check`
- S4 保存が要るものを schema.ts に足し、保存と読み出しをつなぐ（Neon に反映は `npm run db:push`）。デモ用の固定入力で本物の出力を確かめ fixtures を更新 — 完了確認: `npm run check`

## 追記（同期点での変更）
（まとめ役が同期点の決定をここに追記する。上のステップ本体は書き換えない）
