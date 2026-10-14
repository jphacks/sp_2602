# 技術構成と書き方の規約

**決めてあることは議論しない。** 変えたい時は lead に change-request（package.json と設定ファイルは lead の所有）。

## 構成
| 層 | 使うもの | 状態 |
|---|---|---|
| 画面 | Next.js（App Router）+ React + TypeScript | 確定 |
| 見た目 | Tailwind CSS v4。色・角丸・書体は `contracts/tokens.css` のテーマだけ | 確定 |
| 共通部品 | `src/components/ui/`（front-b の所有。shadcn/ui を入れる場合もここ。依存を足すのは lead） | 確定 |
| API | Next.js の Route Handler（`src/app/api/<名前>/route.ts`）。型は Zod の契約 | 確定 |
| サーバ処理 | `src/server/`（外部API・AI・DB はここだけから呼ぶ） | 確定 |
| 整形・lint | Biome（保存時・Claude の編集時に自動整形、コミット前に検査） | 確定 |
| テスト | Vitest（契約と API）。E2E は必要なら Playwright（front-a） | 確定 |
| DB | Neon（Postgres。Vercel の Marketplace から追加）+ Drizzle。手元・テスト・CI はメモリ上の Postgres（PGlite）で自動 | 確定（テーブルはアイデアが決まってから） |
| 公開先 | Vercel（下の「Vercel で動かすための約束」） | 確定 |
| AI 呼び出し | `src/server/` から呼ぶ。出力は Zod で形を固定。デモ用の結果は fixtures に保存 | 確定（SDK は back-a が選ぶ） |

## フォルダと所有者
```
contracts/               型・API表・画面表・デザイン（lead）
src/app/layout.tsx       全体の枠・スマホ優先の幅（lead）
src/app/<画面id>/        1画面 = 1フォルダ = 1人。部品はフォルダ内に自由に増やす
src/app/api/<機能>/<名前>/ Route Handler（その機能の back）。中身は handle() に1行で渡す。health は lead
src/server/<機能>/       サーバ処理（その機能の back）。route.ts（契約つき Handler）/ errors.ts（AppError）は lead
src/server/db/           DB。schema.ts = テーブル定義（back-a・back-b の共有）/ index.ts = 接続 db()（back-a）
src/lib/                 api クライアント・画面間の受け渡し（lead）
src/components/ui/       共通部品（front-b）。欲しい部品は Issue で依頼
```

## 書き方の約束
- **スマホ優先**：スマホ幅（375px）で作り、`md:` で PC 向けを足す。押せる部品は高さ `min-h-11`（44px）以上。
- **Server / Client**：画面ファイルは操作があるなら先頭に `"use client"`。サーバ処理（`src/server/`）を画面から直接 import しない（`server-only` で止まる）。
- **通信は `call()` と `stream()` だけ**：`fetch("/api/...")` を手書きしない。新しい API は契約（`contracts/api.ts`）に足してから。契約にあって Route Handler がないとテストが落ちる。
  - `kind: "json"`：1回で返す。`call("名前", 入力)`
  - `kind: "stream"`：少しずつ返す（AI の返答・進み具合）。`stream("名前", 入力, (chunk) => …)`。サーバ側は `handleStream` の中で `emit(chunk)` を呼び、最後に結果を return
  - 条件つきの取得も POST で送る（GET で条件を渡す仕組みは入れていない。必要になったら lead へ）
- **エラーは1つの形**（`contracts/errors.ts` の `ApiError`：code / message / hint）
  - サーバ：失敗は `throw new AppError("upstream_failed")` のように投げるだけ。形と HTTP ステータスは `route.ts` が揃える。想定外の例外は中身を隠して `internal` にする
  - 画面：`catch (e) { setError(errorOf(e)) }` → `message`（何が起きたか）と `hint`（次に何をするか）をそのまま出す
- **DB と契約は分ける**：`contracts/` は「画面とサーバの間で受け渡す形」だけ。DB のテーブル定義は `src/server/db/schema.ts`（back-a・back-b）に置き、テーブル ⇔ 契約の型の変換は `src/server/` の中だけで行う。画面は DB の形を知らない（DB 設計を変えても画面担当に影響しない）。テーブルの列を契約にそのまま流用しない
- **画面間のデータは `useFlow()` 経由**：画面同士で import し合わない。受け渡しの追加は lead へ。
- **見た目の値は直書きしない**：`bg-[#fff]`・`p-[13px]`・`style={{}}`・色コードは `npm run lint` が弾く。どうしても必要な行は `// style-ok 理由` を付ける。
- **依存の追加は lead だけ**：`npm install` したくなったら Issue で依頼（package.json は lead の所有なので、コミットできない）。
- **MOCK=1 で必ず動く**：外部APIやDBが落ちてもデモできる状態を保つ。

## DB
- 使い方：`const d = await db()`（`src/server/db`）→ Drizzle で `d.insert(表).values(…)` / `d.select().from(表)`。テーブルは `src/server/db/schema.ts`。
- つながる先は `DATABASE_URL` で決まる。なし → PGlite（メモリ上の Postgres。サーバを止めると空）、あり → Neon。手元で開発・テストするだけなら何も設定しなくてよい。
- テーブルを変えたら `npm run db:push`（Neon に反映。マイグレーションは作らない。データが消える変更は `-- --force`）。手元の PGlite は起動時に自動で作る。
- 約束：id は uuid、作成日時は `created_at`（timestamptz）、列名は snake_case。形が決まらないもの（AI の生の返答など）は jsonb に丸ごと。外部キーの連鎖削除は使わない。
- AI を呼んだら `ai_calls` に1行残す（入力・出力・時間）。審査で「本物が動いている」を見せる材料と、不具合の調査に使う。
- ログインは作らない（必要なら固定のデモ用アカウント）。利用者の区別は端末ごとの `clientId`。
- Neon の HTTP 接続では `d.transaction()` が使えない。まとめて書くなら `d.batch([…])`。

## Vercel で動かすための約束
- **関数のメモリやファイルに保存しない**：呼ぶたびに別のインスタンスになりうるので、変数・`Map`・ファイルに置いたデータは消える。残すものは DB、画像などのファイルは Vercel Blob。
- **WebSocket のサーバは立てられない**：画面を自動で更新したいときは数秒ごとの再取得（ポーリング）にする。
- **1回の処理は5分まで**（Hobby の上限）。AI の返答のように時間がかかるものは `kind: "stream"` で少しずつ返す（待っている間も画面が動く）。
- **環境変数は Vercel に設定**：`ANTHROPIC_API_KEY` と `DATABASE_URL`（Neon を Marketplace から追加すると自動で入る）。本番では `MOCK` を入れない。手元に本番と同じ値が要るときは `vercel env pull .env.local`。キーを画面側のコード（`NEXT_PUBLIC_` で始まる変数）に出さない。
- **リポジトリは個人のアカウントに置く**：Vercel の無料プラン（Hobby）は、GitHub の組織が持つ非公開リポジトリからは公開できない。個人アカウントの非公開リポジトリならメンバーを招待して使える（公開リポジトリならどちらでもよい）。
- PR ごとに Vercel のプレビュー（専用の URL）ができる。見た目の確認やスマホでの確認に使ってよい。

## アイデア次第で足すもの（当日決める）
| 必要になったら | 足すもの | 誰が |
|---|---|---|
| データを保存する | `src/server/db/schema.ts` にテーブルを足す → `npm run db:push`（Neon は前日に用意済み） | その機能の back |
| ログインが要る | まず固定のデモ用アカウントで済ませる。本当に要るなら Auth.js など（lead が判断） | lead |
| リアルタイム更新 | 数秒ごとの再取得（ポーリング）。それで足りない時だけ外部サービスを lead が判断 | その機能の back |
| 画像・ファイル保存 | Vercel Blob（`@vercel/blob`。lead が依存を足す） | その機能の back |
| スマホのホーム画面に置く | PWA（manifest とアイコン） | lead |
| ブラウザだけで完結する | DB なしで localStorage（`src/lib/` に保存関数を1つ） | lead |
