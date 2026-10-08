# 技術構成と書き方の規約

**決めてあることは議論しない。** 変えたい時は lead に change-request（package.json と設定ファイルは lead の所有）。

## 構成
| 層 | 使うもの | 状態 |
|---|---|---|
| 画面 | Next.js（App Router）+ React + TypeScript | 確定 |
| 見た目 | Tailwind CSS v4。色・角丸・書体は `contracts/tokens.css` のテーマだけ | 確定 |
| 共通部品 | `src/components/ui/`（lead の所有。shadcn/ui を入れる場合もここ） | 確定 |
| API | Next.js の Route Handler（`src/app/api/<名前>/route.ts`）。型は Zod の契約 | 確定 |
| サーバ処理 | `src/server/`（外部API・AI・DB はここだけから呼ぶ） | 確定 |
| 整形・lint | Biome（保存時・Claude の編集時に自動整形、コミット前に検査） | 確定 |
| テスト | Vitest（契約と API）。E2E は必要なら Playwright（pitch） | 確定 |
| DB | **Supabase（Postgres）+ Drizzle** | **仮置き**（アイデアが決まってから確定） |
| 公開先 | **Vercel** | **仮置き** |
| AI 呼び出し | `src/server/` から呼ぶ。出力は Zod で形を固定。デモ用の結果は fixtures に保存 | 確定（SDK は back が選ぶ） |

## フォルダと所有者
```
contracts/               型・API表・画面表・デザイン（lead）
src/app/layout.tsx       全体の枠・スマホ優先の幅（lead）
src/app/<画面id>/        1画面 = 1フォルダ = 1人。部品はフォルダ内に自由に増やす
src/app/api/<名前>/      Route Handler（back）。中身は handle() に1行で渡す
src/server/              サーバ処理（back）。route.ts（契約つき Handler）/ errors.ts（AppError）
src/server/db/           DB のテーブル定義と接続（back。DB を使うと決めたら作る）
src/lib/                 api クライアント・画面間の受け渡し（lead）
src/components/ui/       共通部品（lead）。欲しい部品は Issue で依頼
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
- **DB と契約は分ける**：`contracts/` は「画面とサーバの間で受け渡す形」だけ。DB のテーブル定義は `src/server/db/`（back）に置き、テーブル ⇔ 契約の型の変換は `src/server/` の中だけで行う。画面は DB の形を知らない（DB 設計を変えても画面担当に影響しない）。テーブルの列を契約にそのまま流用しない
- **画面間のデータは `useFlow()` 経由**：画面同士で import し合わない。受け渡しの追加は lead へ。
- **見た目の値は直書きしない**：`bg-[#fff]`・`p-[13px]`・`style={{}}`・色コードは `npm run lint` が弾く。どうしても必要な行は `// style-ok 理由` を付ける。
- **依存の追加は lead だけ**：`npm install` したくなったら Issue で依頼（package.json は lead の所有なので、コミットできない）。
- **MOCK=1 で必ず動く**：外部APIやDBが落ちてもデモできる状態を保つ。

## アイデア次第で足すもの（当日決める）
| 必要になったら | 足すもの | 誰が |
|---|---|---|
| データを保存・共有する | Supabase プロジェクト + Drizzle のスキーマ（`src/server/db/`）。`.env` に URL とキー | lead が環境、back がスキーマ |
| ログインが要る | Supabase Auth。デモでは固定のデモ用アカウントでもよい | back |
| リアルタイム更新 | Supabase Realtime | back |
| 画像・ファイル保存 | Supabase Storage | back |
| スマホのホーム画面に置く | PWA（manifest とアイコン） | lead |
| ブラウザだけで完結する | DB なしで localStorage（`src/lib/` に保存関数を1つ） | lead |
