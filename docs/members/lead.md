# lead — つなぎ役（通信・API・セキュリティ／契約・main）＋発表＋まとめ役

## 人間向け（最初に読む）
- ミッション: 画面とサーバが契約（contracts/）どおりにつながって安全に動く状態を保ち、チーム全体を時間内に DEMO.md まで届けて、それを発表で伝える
- 所有ファイル: kit.config.json の owns（ここ以外は触らない）。契約・API の共通部分（`src/server/route.ts` / `errors.ts`・`src/lib/api.ts`）・`src/app/api/health/`・`src/proxy.ts`・設定と scripts・`docs/DEMO.md`・`docs/pitch/`
- 動作確認: `npm run dev`（.env は MOCK=1）で http://localhost:3000 を開く。API は `npm run api -- <契約名>` で叩く
- 詰まったら: 自分の作業は 30分で解決しなければ全員に声をかける（まとめ役が止まると進行が止まる）。契約の問い合わせは最優先で返す（契約が止まると全員が止まる）
- チームの組み方とキックオフでの書き換え: docs/rules/team.md（4人構成）

## 図の担当: データフローダイアグラム（Figma Design と FigJam）
- 流れ: フローチャート（front-b）→ UI（front-a）／データフローチャート（back-a）→ データフローダイアグラム（lead）。全体は docs/rules/team.md「4つの図」
- 描くもの: 外の人・端末（利用者・Android など）、処理（API）、データの置き場所（DB・外部サービス）と、その間を流れるデータ。信頼の境目（ブラウザ／サーバ／外部）を線で区切る
- 元にするもの: back-a のデータフローチャート
- 使い道: 契約（contracts/）の確定、セキュリティの確認（キーがどこにあるか・入力の検査・回数の上限が要る入口）、発表の「仕組み」の図（Figma Design で清書）
- 目安: 契約凍結（11:30）までに下書き（FigJam）、セキュリティの確認（S4）までに清書（Figma Design）

## 触らないファイル（よく間違えるもの）
- 各メンバーの画面・部品・サーバのファイル（直したい時は所有者に Issue）

## セキュリティの約束（この役の担当）
- 入力は契約の Zod で必ず検査される（`handle()` / `handleStream()`）。契約にない入力を受け付ける API を作らない
- キー（`ANTHROPIC_API_KEY`・`DATABASE_URL`）はサーバだけ。`NEXT_PUBLIC_` で始まる変数にしない。画面のコードから `src/server/` を import しない（`server-only` で止まる）
- エラーの中身（例外の文・SQL）を画面に出さない（`route.ts` が `internal` にそろえる）
- AI を呼ぶ API は回数の上限を考える（審査中に連打されても料金が膨らまない）。必要なら `src/proxy.ts` で止める

## まとめ役の仕事（kit.config.json の facilitator）
- `npm run status` で全員の状況を見る（動きのない人・PR のない人・必須の締め切りが近い人に印が出る）。`npm run kit:alarm` は全員分を知らせる
- 同期点を進行する（docs/rules/sync.md。15分以内）。change-request の採否もここで決める（契約として通るかの判断も lead）
- 合流（手伝い）を決める（docs/rules/help.md）。`blocked` Issue が30分以上動かない時はその場で決めてよい
- 進みが時計とずれたら `npm run kit:schedule` で目安を直す（運営の締め切りは動かない）。直したら decisions.md に1行
- 最初に: `npm run kit:deadlines -- issues` で締め切りのやることを Issue にする
- 手が空いた人に次の仕事を渡す（`npm run now` で「すべて完了」と出た人が来る）
- 3つの役を兼ねるので、優先は「契約の問い合わせ → 同期点の進行 → 発表 → 自分のステップ」の順

## 発表
- DEMO.md（課題1文・数字・90秒の台本）は lead が持つ。front-a（UI）・front-b（UX）と合意して、契約凍結と同時に凍結する
- 発表資料・紹介動画・バックアップ録画は `docs/pitch/`。画面の撮影は `npm run shot`、見た目の素材は front-a に頼む

## ステップ（1つ = 30〜60分 = AIへの1回の依頼 = 1PR）
印は付けない。完了は「マージ済み PR のブランチ名 `<自分のid>/S<番号>-…`」から自動で判定され、`npm run now` に ✓ / …（マージ待ち）/ ・（未着手）で出る。

- S1 `npm run kit:reset` でひな型の例を消し、機能A・B の分け方と画面 id を kit.config.json に書く（docs/rules/team.md）→ `npm run kit:owners`。DEMO.md の下書き（課題1文・数字・台本） — 完了確認: `npm run check`
- S2 contracts を確定して凍結（API の path は `/api/<機能>/<名前>`。画面と受け渡すデータは front-b の `docs/flow/README.md` の状態・イベントの表から: 分かれ道の条件に使う値は schemas.ts の項目に、状態ごとの MOCK の固定データは fixtures.ts に。トークンの値は front-a の案から tokens.css に）→ `npm run kit:stub`。DEMO.md も凍結 — 完了確認: `npm run check`
- S3 同期点1 を進行し、採用した change-request を contracts/ に反映（docs/rules/sync.md） — 完了確認: `npm run check`
- S4 セキュリティの確認（上の約束。キーが画面側に出ていない・AI の API の回数上限） — 完了確認: `npm run check`
- S5 発表資料と台本を90秒に（`docs/pitch/`）。DEMO.md どおりの画面をバックアップ録画 — 完了確認: `npm run check`

## 追記（同期点での変更）
（まとめ役が同期点の決定をここに追記する。上のステップ本体は書き換えない）
