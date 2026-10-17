# 技術構成と書き方の規約

**決めてあることは議論しない。** 変えたい時は lead に change-request（package.json と設定ファイルは lead が見る）。
このキットは **Android 向けのペアレンタルコントロールアプリ専用**。iOS は将来対応で、今回は作らない。

## 設計原則（規則）
1. **Android 固有の処理は Kotlin に分ける**：端末の使用時間の取得・使用中アプリの検出・制限画面の表示など、Android にしかない処理は Kotlin に集める。画面と共通処理（TypeScript）に Android 固有の呼び出しを直接書かない。窓口の型だけを共通側に置く（将来 iOS に置き換えられるようにするため）。
2. **制限の判定は端末内で完結させる**：インターネットにつながっていなくても、アプリの画面が動いていなくても、最後に取った制限ルールで判定して止める。サーバの返事を待たない。
3. **保護者の権限はサーバ側で確かめる**：「子どもは制限ルールを変えられない」を、画面の出し分けだけで守らない。ルールを変える API は、サーバが呼んだ人が保護者かを必ず検証する。

## 構成
| 層 | 使うもの | 状態 |
|---|---|---|
| アプリ | React Native + Expo（Development Build）+ TypeScript。Expo Go（Kotlin が動かない試用版）は使えない | 確定 |
| 画面の移動 | Expo Router（`src/app/` のファイルがそのまま画面になる） | 確定 |
| 見た目 | React Native の `StyleSheet`。色・余白・角丸・書体は `contracts/tokens.ts` の名前だけ | 確定 |
| 共通部品 | `src/components/ui/`（front-a の担当。依存を足すのは lead） | 確定 |
| Android 固有の処理 | Kotlin（`modules/kit-native/`。Expo のモジュール）。TypeScript からは Native Module（Kotlin の機能を TypeScript から呼ぶ仕組み）の窓口だけを通して呼ぶ | 確定 |
| API | Hono（Web 標準の軽いサーバ部品）で書き、Vercel Functions で動かす。型は Zod の契約 | 確定 |
| サーバ処理 | `src/server/`（外部API・AI・DB はここだけから呼ぶ） | 確定 |
| 整形・lint | Biome（保存時・Claude の編集時に自動整形。コミット前にも自動で整形し、直せない指摘だけ止める） | 確定 |
| テスト | Vitest（契約と API）。実機・エミュレータでの確認は `npm run shot`（adb で画面を撮る） | 確定 |
| DB | Neon（Postgres。Vercel の Marketplace から追加）+ Drizzle。手元・テスト・CI はメモリ上の Postgres（PGlite）で自動 | 確定（テーブルはアイデアが決まってから） |
| 公開先 | API は Vercel（下の「Vercel で動かすための約束」）。アプリは APK を直接配る | 確定（配布方法はキックオフで正式に決める） |
| AI 呼び出し | `src/server/` から呼ぶ。出力は Zod で形を固定。デモ用の結果は fixtures に保存 | 確定（SDK は back-a が選ぶ） |
| パッケージ管理 | npm | 確定 |

端末は **Android 16 の実機**で確かめる。アプリは、手元の PC から `npm run android`（実機にアプリを入れて起動する）で入れる。

## フォルダと担当
```
contracts/               型・API表・画面表・デザイン（lead）。tokens.ts は色・余白などの名前
app.json                 Expo の設定（lead）
server.ts                Vercel の入口。src/server/app.ts の Hono をそのまま公開（lead）
src/app/_layout.tsx      全体の枠・画面の移動の設定（lead）
src/app/<画面id>/        1画面 = 1フォルダ = 1人。部品はフォルダ内に自由に増やす（index.tsx が画面の本体）
src/server/handlers/<名前>.ts  API の1本ごとの処理（その機能の back）。health は lead
src/server/<機能>/       サーバ処理（その機能の back）。route.ts（契約つき Handler）/ errors.ts（AppError）は lead
src/server/db/           DB。schema.ts = テーブル定義（共有の場所。サーバ担当の back-a が足す）/ index.ts = 接続 db()（back-a）
src/lib/                 api クライアント・画面間の受け渡し（lead）
src/components/ui/       共通部品（front-a）。欲しい部品は Issue で依頼
modules/kit-native/      Kotlin（監視・制限エンジンなど Android 固有の処理）。React Native の画面が動いていなくても動く独立した部品にする（lead が窓口の型を決め、中身は担当が足す）。/android/ は npx expo prebuild が作る生成物で Git に入らないので、ここに書かない
```

## 書き方の約束
- **スマホ優先**：Android のスマホ画面だけを考える（PC 向けの幅は作らない）。押せる部品は高さ・幅とも 44 以上（`contracts/tokens.ts` の名前を使う）。
- **Android 固有の呼び出しは窓口の型を通す**：`UsageStatsManager` や `AccessibilityService` のような Android の機能を画面から直接触らない。Native Module の窓口（`contracts/` の型）を通し、画面は窓口の名前だけを知る。
- **サーバの処理を画面から直接 import しない**：`src/server/` はアプリに入れない。画面からは次の `call()` / `stream()` だけで呼ぶ。
- **通信は `call()` と `stream()` だけ**：`fetch(...)` を手書きしない。新しい API は契約（`contracts/api.ts`）に足してから。契約にあって Handler がないとテストが落ちる。
  - `kind: "json"`：1回で返す。`call("名前", 入力)`
  - `kind: "stream"`：少しずつ返す（AI の返答・進み具合）。`stream("名前", 入力, (chunk) => …)`。サーバ側は `handleStream` の中で `emit(chunk)` を呼び、最後に結果を return
  - 条件つきの取得も POST で送る（GET で条件を渡す仕組みは入れていない。必要になったら lead へ）
- **エラーは1つの形**（`contracts/errors.ts` の `ApiError`：code / message / hint）
  - サーバ：失敗は `throw new AppError("upstream_failed")` のように投げるだけ。形と HTTP ステータスは `route.ts` が揃える。想定外の例外は中身を隠して `internal` にする
  - 画面：`catch (e) { setError(errorOf(e)) }` → `message`（何が起きたか）と `hint`（次に何をするか）をそのまま出す
- **DB と契約は分ける**：`contracts/` は「画面とサーバの間で受け渡す形」だけ。DB のテーブル定義は `src/server/db/schema.ts`（back-a）に置き、テーブル ⇔ 契約の型の変換は `src/server/` の中だけで行う。画面は DB の形を知らない（DB 設計を変えても画面担当に影響しない）。テーブルの列を契約にそのまま流用しない
- **画面間のデータは `useFlow()` 経由**：画面同士で import し合わない。受け渡しの追加は lead へ。
- **見た目の値は直書きしない**：`StyleSheet.create` の中で、色コード（`"#fff"`）・数値の余白（`padding: 13`）を直接書かず、`contracts/tokens.ts` の名前を使う。`style={{ … }}` の直書きも同じ。`npm run lint` が弾く。どうしても必要な行は `// style-ok 理由` を付ける。
- **依存の追加は lead に頼む**：`npm install` したくなったら Issue で依頼（package.json は lead が見る）。Native のライブラリを足すと Development Build の作り直しが要るので、まとめて頼む。
- **MOCK=1 で必ず動く**：外部APIやDBが落ちてもデモできる状態を保つ。

## DB
- 使い方：`const d = await db()`（`src/server/db`）→ Drizzle で `d.insert(表).values(…)` / `d.select().from(表)`。テーブルは `src/server/db/schema.ts`。
- つながる先は `DATABASE_URL` で決まる。なし → PGlite（メモリ上の Postgres。サーバを止めると空）、あり → Neon。手元で開発・テストするだけなら何も設定しなくてよい。
- **アプリ（端末）から DB に直接つながない**：接続情報が端末に入ってしまうため。DB を触るのは `src/server/` だけ。アプリは API だけを呼ぶ。
- テーブルを変えたら `npm run db:push`（Neon に反映。マイグレーションは作らない。データが消える変更は `-- --force`）。手元の PGlite は起動時に自動で作る。
- 約束：id は uuid、作成日時は `created_at`（timestamptz）、列名は snake_case。形が決まらないもの（AI の生の返答など）は jsonb に丸ごと。外部キーの連鎖削除は使わない。
- AI を呼んだら `ai_calls` に1行残す（入力・出力・時間）。審査で「本物が動いている」を見せる材料と、不具合の調査に使う。
- 端末側の保存（最後に取った制限ルール・使用履歴）は Kotlin 側（Room）に置く。サーバの DB とは別。
- 利用者の区別（保護者か子どもか、どの子か）の仕組みはキックオフで決める。決まるまで、契約には役割（保護者・子ども）の型の置き場だけを使う。
- Neon の HTTP 接続では `d.transaction()` が使えない。まとめて書くなら `d.batch([…])`。

## Vercel で動かすための約束
ここで Vercel に置くのは **API サーバだけ**（アプリは Vercel に置かない）。
- **関数のメモリやファイルに保存しない**：呼ぶたびに別のインスタンスになりうるので、変数・`Map`・ファイルに置いたデータは消える。残すものは DB、画像などのファイルは Vercel Blob。
- **WebSocket のサーバは立てられない**：制限ルールの受け取りは、端末から一定時間ごとに取りに行く（定期同期）。
- **1回の処理は5分まで**（Hobby の上限）。AI の返答のように時間がかかるものは `kind: "stream"` で少しずつ返す（待っている間も画面が動く）。
- **環境変数は Vercel に設定**：`ANTHROPIC_API_KEY` と `DATABASE_URL`（Neon を Marketplace から追加すると自動で入る）。本番では `MOCK` を入れない。手元に本番と同じ値が要るときは `vercel env pull .env.local`。キーをアプリ側のコード（`EXPO_PUBLIC_` で始まる変数。アプリに埋め込まれて誰でも読める）に出さない。
- **アプリが呼ぶ API の URL は `EXPO_PUBLIC_API_URL` で決める**：手元は `npm run dev:server` の URL（実機からは PC の IP）、本番は Vercel の URL。
- **リポジトリは JPHACKS が用意する公開リポジトリ**（`github.com/jphacks/<チーム>`）：公開なので、`.env` やキーを絶対にコミットしない（`.gitignore` 済み）。Issue・PR・コミットの文面も誰でも読める。Vercel の無料プラン（Hobby）は組織の**公開**リポジトリなら公開できる。
- **Vercel への公開のしかた**（前日に lead が確かめて1つに決める。docs/kit/pending.md）：
  - A. Vercel の GitHub 連携で jphacks のリポジトリを読み込む（組織へのアプリの導入に組織の管理者の許可が要るかもしれない）。できれば main へのマージで自動公開、PR ごとにプレビューの URL ができる
  - B. できなければ Vercel CLI で手元から公開する（`vercel deploy --prod`。main を pull してから。まとめ役か lead が同期点ごとに）

## Android の制約（要件に含めないこと）
- 強制停止やアンインストールを完全に防ぐことはできない。OS の設定からの権限解除も防がない。
- 求めるのは「子どもが通常のアプリ操作だけでは制限ルールを変えられない」こと。
- `AccessibilityService` を使うアプリは Google Play の審査で注意が要る。配布は APK の直接配布を前提にする。

## アイデア次第で足すもの（当日決める）
| 必要になったら | 足すもの | 誰が |
|---|---|---|
| データを保存する | `src/server/db/schema.ts` にテーブルを足す → `npm run db:push`（Neon は前日に用意済み） | その機能の back |
| ログインが要る | 保護者はメールか Google でログイン、子ども端末は保護者が発行するペアリングコードで紐づける案（キックオフで正式に決める。lead が判断） | lead |
| ルールの更新を早く届ける | まず定期同期。それで足りない時だけ Push 通知（Firebase の設定が要る。lead が判断） | その機能の back |
| 画像・ファイル保存 | Vercel Blob（`@vercel/blob`。lead が依存を足す） | その機能の back |
| Android の新しい機能を使う | `modules/kit-native/` に Kotlin を足し、窓口の型を `contracts/` に足す（先に lead へ Issue） | lead |
