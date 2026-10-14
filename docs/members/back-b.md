# back-b — 機能Bのサーバ（処理・AI）

## 人間向け（最初に読む）
- ミッション: （機能Bが DEMO.md のどこを成立させるか 1文。キックオフで書く）
- 所有ファイル: kit.config.json の owns（ここ以外は触らない）。`src/server/b/`・`src/app/api/b/`・`tests/server/b/`
- テーブル定義（`src/server/db/schema.ts`）は back-a と共有。自分の機能の表だけ足す。DB の使い方は `await db()`（docs/rules/stack.md「DB」）
- 動作確認: `npm run dev`（.env は MOCK=1）→ `npm run api -- <契約名>` で自分の API を叩く
- 詰まったら: 30分で解決しなければ lead に声をかける / `blocked` Issue

## 触らないファイル（よく間違えるもの）
- contracts/ 全部（変えたい時は change-request Issue）
- `src/server/route.ts` / `errors.ts`（lead）、`src/server/a/`・`src/server/db/index.ts`（back-a）、画面のフォルダ

## ステップ（1つ = 30〜60分 = AIへの1回の依頼 = 1PR）
印は付けない。完了は「マージ済み PR のブランチ名 `<自分のid>/S<番号>-…`」から自動で判定され、`npm run now` に ✓ / …（マージ待ち）/ ・（未着手）で出る。

- S1 MOCK=1 で機能B の API が契約どおり返る（lead の仮の API を置き換える） — 完了確認: `npm run check`
- S2 機能B の本物の処理（`src/server/b/`。外部の失敗は `throw new AppError("upstream_failed")`） — 完了確認: `npm run check`
- S3 保存が要るものを schema.ts に足し、保存と読み出しをつなぐ — 完了確認: `npm run check`
- S4 デモ用の固定入力で本物の出力を確認し fixtures を更新 — 完了確認: `npm run check`

## 追記（同期点での変更）
（lead が同期点の決定をここに追記する。上のステップ本体は書き換えない）
