# チームの組み方（4人）

```
        lead（つなぎ役：通信・API・セキュリティ／契約・main ＋ データフローダイアグラム ＋ 発表 ＋ まとめ役）
       ／                    │                         ＼
  back-a（サーバ全部：     front-a（UI＝見た目：        front-b（UX＝流れ：
  機能A・B の処理・DB・     Figma Design・部品）          FigJam のフローチャート・
  データフローチャート）                                  画面の本体）
```

- サーバは **縦割り**: back-a が機能A・B のサーバと DB を1人で持つ。アイデアは今までどおり機能2つ（A・B）に分け、API の path とフォルダで区別する。
- 画面は **横割り**: front-a（UI）が見た目、front-b（UX）が流れ。同じ画面のファイルを2人で触らないよう、次のように分ける。
  - front-a: Figma Design（線画・画面遷移の試作・作り込み・トークン案）と、`src/components/`（共通部品 `ui/` と画面ごとの見た目の部品 `<画面id>/`）。部品は表示だけ（`call()` / `stream()` / `useFlow()` を使わない）。
  - front-b: FigJam のフローチャート（状態遷移図）と状態・イベントの表（`docs/flow/`。**チームの流れの元**）と、画面の本体 `src/app/<画面id>/`（状態・イベント・通信・useFlow・部品を並べる）、e2e（`tests/e2e/`）。
  - 部品が受け取るデータの形（props）は、状態・イベントの表の行に合わせる。変える時は Issue で相手に知らせてから。
- 機能をまたぐもの（契約・API の入口の仕組み・通信・エラー・認証）は lead が持つ。画面とサーバの受け渡しは必ず契約を通す。
- **発表は lead**（DEMO.md・資料・紹介動画・バックアップ録画。`docs/DEMO.md`・`docs/pitch/`）。
- **まとめ役も lead**（kit.config.json の `facilitator`）：同期点の進行・合流（手伝い）の判断・時刻表のずれの修正・change-request の採否。lead は役を兼ねるので、契約の問い合わせ → 同期点 → 発表 → 自分のステップの順に優先する。
- **つなぎ役は lead**（members の1人目）：契約の所有者・CODEOWNERS のレビュー役・change-request の宛先。

## 4つの図（どの図から何を作るか）
```
フローチャート（front-b・FigJam）
  ├→ UI（front-a・Figma Design）
  └→ データフローチャート（back-a・FigJam）
        └→ データフローダイアグラム（lead・Figma Design と FigJam）
```

| 図 | 担当 | 置き場所 | 元にするもの | 何を描くか | 何に使うか |
|---|---|---|---|---|---|
| フローチャート | front-b | FigJam（リンクは `docs/flow/README.md`） | DEMO.md | 状態と、状態が変わるきっかけ（イベント）・分かれ道の条件 | 状態・イベントの表 → 画面の本体。UI とデータフローチャートの元 |
| UI | front-a | Figma Design（リンクは `docs/design/README.md`） | フローチャート | 状態ごとの線画 → 作り込んだ画面・トークン | 画面の部品（`src/components/`）・`contracts/tokens.css` |
| データフローチャート | back-a | FigJam（リンクは `docs/members/back-a.md` の追記か `docs/flow/README.md`） | フローチャート | 画面の操作ごとに、どの API を呼び、サーバの中で何を計算・保存し、何を返すか（処理の順番と分かれ道） | API の処理（`src/server/`）・DB のテーブル（`src/server/db/schema.ts`） |
| データフローダイアグラム | lead | Figma Design と FigJam | データフローチャート | 外の人・端末（利用者・Android など）、処理（API）、データの置き場所（DB・外部サービス）と、その間を流れるデータ。信頼の境目（ブラウザ／サーバ／外部）を線で区切る | 契約（`contracts/`）の確定・セキュリティの確認（キーの置き場所・入力の検査・回数の上限）・発表の「仕組み」の図 |

- 図の矢印は上の順。前の図が変わったら、後ろの図の担当に Issue で知らせる（例: フローチャートに状態が増えた → front-a と back-a へ）。
- 図は「作るための道具」。契約（`contracts/`）と DEMO.md が正で、図と食い違ったら契約・DEMO.md に合わせて図を直す。
- 図を AI に描かせるときは、FigJam は Mermaid（図を文で書く形）から作れる。元の Mermaid は各自の docs に残しておくと、AI が読んで作業に使える。

## 担当の場所（kit.config.json の owns）
持ち主は members の並び順（lead → back-a → front-a → front-b）で、最初に当てはまった人になる。

| 人 | 自分だけが触る場所 |
|---|---|
| lead | `contracts/`・`src/lib/`・`src/server/route.ts`・`src/server/errors.ts`・`src/app/api/health/`・`src/proxy.ts`・`tests/server/api.test.ts`・設定・`scripts/`・`docs/rules/`・`docs/DEMO.md`・`docs/pitch/` など |
| back-a | `src/server/a/`・`src/server/b/`・`src/app/api/a/`・`src/app/api/b/`・`tests/server/a/`・`tests/server/b/`・`src/server/db/index.ts`・`src/server/` 直下の共通の処理。テーブル定義 `src/server/db/schema.ts` は共有の場所だが、サーバ担当は1人なので実際には back-a だけが足す |
| front-a | `src/components/`・`docs/design/` |
| front-b | 画面の本体（`src/app/<画面id>/`）・`docs/flow/`・`tests/e2e/` |

API の path は `/api/<機能>/<名前>`（例: `/api/quiz/grade`）にする。フォルダ `src/app/api/<機能>/` は back-a のもの。

## キックオフでの書き換え（lead の S1）
1. 機能A・B に短い英語名を付ける（例: `quiz` と `report`）。
2. kit.config.json の back-a の owns の `a` / `b` をその名前に書き換える（`src/server/a/**` → `src/server/quiz/**`、`src/app/api/a/**` → `src/app/api/quiz/**`、`tests/server/a/**` も。b も同じ）。
3. 画面 id が決まったら、front-b の owns の `src/app/home/**` / `src/app/result/**` を自分たちの画面 id に置き換える（1画面 = 1行）。画面ごとの見た目の部品は `src/components/<画面id>/` に置くので、front-a の owns は書き換えなくてよい。
4. docs/members/*.md の所有ファイル・ステップ・触らないファイルに書いてあるフォルダ名（`src/server/a/` など）も、1〜3 で付けた名前に書き換える（kit.config.json だけ直すと説明書が古い名前のまま残り、AI が古いフォルダに作ろうとして止められる。`npm run check` が見つける）。
5. `npm run kit:owners` → `npm run check` → commit。
6. docs/members/*.md の「ミッション」を1文ずつ埋める（各自でもよい）。

## 機能が2つにきれいに割れないとき
ほぼ1画面で AI の処理だけが重い、など。back-a の中のフォルダの分け方だけ変える（例: `src/server/ai/` と `src/server/data/`）。画面の分け方（UI / UX）は変えない。

## 個人の作業ファイル（誰が何をしたか・今どうなっているか）
1人1ファイル。見出しは: やること（ステップに載らないもの）/ 待ち / 行き詰まり / 未決・解決済み / 決めたこと（理由）/ GitHub の下書き / AI メモ / ログ。
- 自動: `npm run step` で「開始」と2行目の「今:」、`npm run merge` で「完了」（かかった分も）。
- 手で（1行ずつ）: `npm run log -- todo|wait|stuck|q|decide|ai|gh "…"`、解決は `npm run log -- done "…"`。人はエディタで開いて直してもよい（`npm run log -- open`）。
- 行き詰まりは「範囲 内/外 ／ 試したこと ／ 解決できない理由（権限・契約不足・知識・外部・時間）／ 次の手」。30分を超えると `npm run now` が「Issue にする」と知らせる。範囲の外は所有者に Issue（自分で直さない）。
- 優先順位はステップの順番と `npm run now` のやることで決まる。このファイルで別の順位は付けない。他の人に関わる未決は docs/requirements/open.md か Issue に出す。GitHub の状態（Issue が開いているか等）は書き写さない。
- AI はこのファイルを読まない（トークンを使わない）。コマンドで1行足すだけ。
- 置き場所はリポジトリの外（Windows は `C:\hackathon\log\<リポジトリ名>\<自分のid>.md`、Mac / Linux は `~/hackathon/log/…`。`KIT_LOG_DIR` で変えられる）。リポジトリは公開なので、個人のメモはそこに出さない。
- 使いどころ: 同期点の30秒報告（`npm run log` で今日の分を読む）、終わった後の振り返り、発表で「誰が何をしたか」を聞かれた時。

## 人を決めたら
kit.config.json の `github` に各自の GitHub のユーザー名を書き、`npm run kit:owners`。members の **1人目がつなぎ役**（契約の所有者・CODEOWNERS のレビュー役・change-request の宛先）なので、lead を先頭から動かさない。まとめ役を変えるときは `facilitator` を書き換える。
