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
- デザイン（Figma で全体の雰囲気のモック → 時間があれば作り込み。`docs/design/`）と発表（DEMO.md・資料・紹介動画・通しの確認）は front-a。共通部品 `src/components/` は front-b。
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

## 人を決めたら
kit.config.json の `github` に各自の GitHub のユーザー名を書き、`npm run kit:owners`。members の **1人目がつなぎ役**（契約の所有者・CODEOWNERS のレビュー役・change-request の宛先）なので、lead を先頭から動かさない。まとめ役を変えるときは `facilitator` を書き換える。
