# front-a — UI（見た目）: Figma Design・共通部品・画面ごとの見た目の部品

## 人間向け（最初に読む）
- ミッション: アプリ全体の見た目を決め、どの画面もデザインどおりに見える部品をそろえる
- 所有ファイル: kit.config.json の owns（ここ以外は触らない）。`src/components/`（共通部品 `ui/` と、画面ごとの見た目の部品 `src/components/<画面id>/`）・`docs/design/`
- 動作確認: `npm run dev`（.env は MOCK=1）で http://localhost:3000 を開く。見た目は `npm run shot` で撮って確かめる（スマホ幅 375px と PC 幅）
- 詰まったら: 30分で解決しなければまとめ役（lead）に声をかける / `blocked` Issue。契約・API のことは lead へ

## front-b（UX）との分け方
画面は「front-a が見た目の部品を作り、front-b が画面の本体（`src/app/<画面id>/`）でそれを並べ、状態・イベント・通信をつなぐ」。同じファイルを2人で触らない。
- 部品は **表示だけ** にする（受け取ったデータを出す・押されたら渡された関数を呼ぶ）。`call()` / `stream()` / `useFlow()` は部品の中で使わない（それは front-b の画面の本体の仕事）
- 部品が受け取るデータの形（props）は、front-b の状態・イベントの表の行に合わせる。形を変える時は front-b に Issue で知らせてから
- 状態（通常 / 押せない / 読み込み中 / エラー / データなし）ごとの見た目は、部品の props で切り替えられるようにする

## デザイン（Figma Design）
順番は **front-b の状態遷移 → 線画で試す → トークン → 作り込み**。状態遷移図と状態・イベントの表は front-b が FigJam と `docs/flow/README.md` で持つ。front-a はそれを画面に写す。Figma のファイルの整理（ページ分け・名前の決まり）は `docs/design/README.md`。

| いつ | やること | 置き場所 |
|---|---|---|
| キックオフ〜11:20 | front-b の状態遷移を見ながら、状態ごとの **線画** を作り、画面どうしをプロトタイプの矢印でつなぐ（**画面遷移の試作**） | Figma `02 線画` |
| 11:20（5分） | **全員で試作を触る**（front-b が進行）。押す場所に迷わないか／足りない状態はないか | — |
| 11:20〜11:30 | トークンの値（色・文字・角丸）を change-request で lead に渡す | Figma `05 トークン` → lead が `contracts/tokens.css` |
| 凍結後〜同期点1 | DEMO.md で見せる状態から **作り込む**。部品の形と状態を `04 部品` で決める | Figma `03 画面`・`04 部品`、書き出し画像は `docs/design/` |
| 同期点ごと | 実装の画面を `npm run shot` で撮り、`03 画面` の同じ名前のフレームと並べる。差は「部品を直す（自分）」「画面の本体を直す（front-b に Issue）」「Figma を直す」に分ける | — |

- 色・文字・角丸は `contracts/tokens.css` の名前で決める（Tailwind のクラスになる）。Figma の変数も同じ名前にする。
- AI に部品を作らせるときは、状態・イベントの表の行と、同じ名前のフレーム（Figma の MCP か書き出し画像）を渡す。

## 図の担当: UI（Figma Design）
- 流れ: フローチャート（front-b）→ UI（front-a）／データフローチャート（back-a）→ データフローダイアグラム（lead）。全体は docs/rules/team.md「4つの図」
- 描くもの: front-b のフローチャートの状態ごとの線画 → 作り込んだ画面・トークン（下の「デザイン（Figma Design）」）
- 元にするもの: front-b のフローチャート（FigJam）。フローチャートにない状態の画面は作らない（足りなければ front-b に Issue）
- 目安: 11:20 に線画の試作を全員で触る、11:30 までにトークン案を lead へ

## 触らないファイル（よく間違えるもの）
- contracts/ 全部（色・角丸・書体の `tokens.css` も。変えたい時は change-request Issue）
- 画面の本体 `src/app/<画面id>/`（front-b）、`docs/flow/`（front-b）、`docs/DEMO.md`・`docs/pitch/`（lead）

## ステップ（1つ = 30〜60分 = AIへの1回の依頼 = 1PR）
印は付けない。完了は「マージ済み PR のブランチ名 `<自分のid>/S<番号>-…`」から自動で判定され、`npm run now` に ✓ / …（マージ待ち）/ ・（未着手）で出る。

- S1 線画と画面遷移の試作（Figma `02 線画`。front-b の状態遷移を画面に写し、`docs/design/README.md` に試作のリンク）。11:20 に全員で触る — 完了確認: `npm run check`
- S2 雰囲気とトークン（Figma `05 トークン` と主要な1画面の作り込み、`docs/design/` に書き出し画像）。トークンの値を change-request で lead へ（契約凍結まで） — 完了確認: `npm run check`
- S3 共通部品を `src/components/ui/` に作る（ボタン・入力欄・読み込み表示・エラー表示。形と状態は Figma `04 部品`。front-b が最初に使うものから） — 完了確認: `npm run check`
- S4 画面ごとの見た目の部品を `src/components/<画面id>/` に作る（状態・イベントの表の行ごとに、props で状態を切り替えられる形） — 完了確認: `npm run check`
- S5 全画面をスマホ幅と PC 幅で撮り、Figma と見比べて見た目をそろえる（`npm run shot`）。発表用の画面の素材を lead に渡す — 完了確認: `npm run check`

## 追記（同期点での変更）
（まとめ役が同期点の決定をここに追記する。上のステップ本体は書き換えない）
