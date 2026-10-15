# チームの組み方（5人）

```
              lead（つなぎ役：通信・API・セキュリティ／契約・main）
             ／                                   ＼
  機能A: back-a（サーバ・DB の接続）              機能B: back-b（サーバ）
         front-a（画面＋デザイン＋発表）                 front-b（画面＋共通部品＋まとめ役）
```

- アイデアを **機能2つ（A・B）** に分け、サーバと画面を同じ線で割る。画面だけ別に悩まない。
- 機能をまたぐもの（契約・API の入口の仕組み・通信・エラー・認証）は lead が持つ。両機能の間の受け渡しは必ず契約を通す。
- テーブル定義 `src/server/db/schema.ts` は back-a・back-b の共有。自分の機能の表だけ足す。
- デザイン（状態遷移図と線画の試作 → 全員で触る → Figma で作り込み。`docs/design/`）と発表（DEMO.md・資料・紹介動画・通しの確認）は front-a。共通部品 `src/components/` は front-b。
- **まとめ役は front-b**（kit.config.json の `facilitator`）：同期点の進行・合流（手伝い）の判断・時刻表のずれの修正。契約の採否は同期点でまとめ役が進め、契約として通るかは lead が判断する。
- **つなぎ役は lead**（members の1人目）：契約の所有者・CODEOWNERS のレビュー役・change-request の宛先。

## 担当の場所（kit.config.json の owns）
| 人 | 自分だけが触る場所 |
|---|---|
| lead | `contracts/`・`src/lib/`・`src/server/route.ts`・`src/server/errors.ts`・`src/app/api/health/`・`src/proxy.ts`・`tests/server/api.test.ts`・設定・`scripts/`・`docs/rules/` など |
| back-a | `src/server/a/`・`src/app/api/a/`・`tests/server/a/`・`src/server/db/index.ts`・`src/server/` 直下の共通の処理 |
| back-b | `src/server/b/`・`src/app/api/b/`・`tests/server/b/` |
| front-a | 機能A の画面フォルダ・`docs/design/`・`docs/DEMO.md`・`docs/pitch/`・`tests/e2e/` |
| front-b | 機能B の画面フォルダ・`src/components/` |

API の path は `/api/<機能>/<名前>`（例: `/api/quiz/grade`）にする。フォルダ `src/app/api/<機能>/` がそのまま機能の担当者のものになる。

## キックオフでの書き換え（lead の S1）
1. 機能A・B に短い英語名を付ける（例: `quiz` と `report`）。
2. kit.config.json の owns の `a` / `b` をその名前に書き換える（`src/server/a/**` → `src/server/quiz/**`、`src/app/api/a/**` → `src/app/api/quiz/**`、`tests/server/a/**` も）。
3. 画面 id が決まったら、front-a / front-b の owns の `src/app/home/**` / `src/app/result/**` を自分たちの画面 id に置き換える（1画面 = 1行。画面が3つ以上なら機能ごとに並べる）。
4. `npm run kit:owners` → `npm run check` → commit。
5. docs/members/*.md の「ミッション」を1文ずつ埋める（各自でもよい）。

## 機能が2つにきれいに割れないとき
ほぼ1画面で AI の処理だけが重い、など。割り方だけ変える（フォルダの引っ越しは要らない）:
- back-a = AI（`src/server/ai/`）、back-b = データと保存（`src/server/data/`）
- front-a = 画面＋発表、front-b = 共通部品・見た目の仕上げ・スマホ / PC の確認

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
