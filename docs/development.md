# 動かし方とテスト

手元の PC でサーバとアプリを動かす方法、実機2台で試す方法、テストの構成、デモの前の注意をまとめます。

## 1. 用意するもの

- Node.js（版は `.nvmrc` の `24`）
- Android の実機（またはエミュレータ）と、アプリを作るための Android の開発環境（`npm run android` が使う）
- このリポジトリ（作業は直下 `sp_2602/` で行う）

## 2. 最初の準備

```bash
npm ci                 # package-lock.json どおりに部品を入れる
cp .env.example .env   # 手元用の環境変数（.env は Git に入れない）
```

## 環境変数の項目

`.env` はサーバ（`npm run dev:server` が読む）とアプリ（`EXPO_PUBLIC_` で始まるものだけ。アプリを作るとき・Metro を立てるときに埋め込まれる）の両方が使います。

| 項目 | 使う側 | 意味 | 手元の値 |
|---|---|---|---|
| `MOCK` | サーバ | `1` にすると、(1) `mock-` で始まるログイン（保護者・子ども・はじめての人）とその合言葉を受け付け、(2) 手元の DB（PGlite。`DATABASE_URL` が空のとき）を開いたときにデモの3人と見本のデータを DB に1回だけ入れる（`src/server/seed/demo.ts`。`DATABASE_URL` の DB には自動では入れない）。`MOCK=1` でないサーバでは、DB に残った MOCK のログインの人の合言葉も 401（D-126）。処理（API）は `MOCK` があってもなくても同じ DB の処理を通る。Vercel の本番（`VERCEL_ENV=production`）では入れても無視する（デモの人の合言葉は固定で、だれでも知っているため）。**本番では入れない** | `1` |
| `DATABASE_URL` | サーバ | Hono APIがNeonのpooled PostgreSQLへ接続する。本番では必須。空なら手元の PGlite（Node の中で動く Postgres。`npm run dev:server` は `state/pglite` に残す。テストはメモリの上だけ） | 空 |
| `EXPO_PUBLIC_API_URL` | アプリ | アプリがつなぐサーバ。空なら `http://10.0.2.2:3000`（Android エミュレータから見た手元の PC）。実機なら PC の LAN の IP（例 `http://192.168.0.5:3000`） | 空（エミュレータ）／PC の IP（実機） |
| `GOOGLE_WEB_CLIENT_ID` | サーバ | 本物の Google ログインで、ID トークンの宛先（aud）として確かめる Web のクライアント ID | 空（MOCK のログイン） |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | アプリ | 上と同じ値。あればログイン画面が本物の「Google でログイン」になる。空なら MOCK のボタンを出す | 空 |
| `EXPO_PUBLIC_FAKE_USAGE` | アプリ | `1` にすると、Kotlin の部品がなくても仮の使用時間を返す（`src/lib/native.ts`） | デモでは `1` |
| `PORT` | サーバ | 手元のサーバの番号（`.env.example` にはない。なければ 3000） | 書かない |
| `MOCK_PERSIST` | サーバ | `0` にすると、`DATABASE_URL` がないときの手元の DB（PGlite）をフォルダに残さない（メモリだけ。止めると消える。`.env.example` にはない） | 書かない |
| `LOCAL_DB_DIR` | サーバ | `DATABASE_URL` がないときに手元の DB（PGlite）を残すフォルダ（`.env.example` にはない。なければ `state/pglite`。`src/server/dev.ts`） | 書かない |

`EXPO_PUBLIC_` の値を変えたら、Metro（`npm run dev`）を止めて立て直してください（アプリに埋め込まれるため）。

## 3. 動かす

ターミナルを2つ使います。

```bash
# 1つ目: サーバ（http://localhost:3000。同じネットワークの全アドレスで待つ）
npm run dev:server

# 2つ目: アプリ
npm run android   # 初回と、部品（Kotlin・ネイティブの依存）を変えたとき。開発用のアプリを作って端末に入れる
npm run dev       # 2回目からは Metro だけ立てる（開発用のアプリが PC の Metro につながる）
```

- サーバが立つと `サーバが立ちました: http://localhost:3000（MOCK=1）` と出ます。`http://localhost:3000/api/health` を開くと `{"ok":true,"mock":true}` が返ります。
- `npm run dev:server` は `tsx watch` です。サーバのファイルを書き換えるとサーバが立ち直ります。データ（ログイン・紐づけ・日程など）は手元の DB（`state/pglite`）に残っているので消えません（7章「手元のサーバを立て直すと」）。
- Kotlin（`modules/kit-native/`）を書き換えたら、`npm run android` で作り直します（画面の即時反映では変わらない）。
- `npm run dev` は `expo start --dev-client` です。`npm run android` で入れた開発用のアプリ（`expo-dev-client`。Google ログイン・カメラなどの部品を含む）から使います。

### MOCK のログイン

`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` が空のとき、ログイン画面に3つのボタンが出ます。

| ボタン | 何になるか |
|---|---|
| 保護者としてログイン（デモ） | デモの保護者（デモの子どもと連携済み。見本の計画・テスト・記録あり） |
| 子どもとしてログイン（デモ） | デモの子ども |
| はじめての人としてログイン（この端末: xxxx） | この端末だけの「はじめての人」（役割なし）。**QR の紐づけを試すときは、2台ともこれを押す** |

サーバ側は `MOCK=1` のときだけ受け付けます。`MOCK=1` がないと「開発用のログインはこのサーバでは使えません」になります。

## 4. 実機2台を同じ Wi-Fi で PC のサーバにつなぐ

1. PC と2台のスマホを**同じ Wi-Fi** につなぐ。
2. PC の LAN の IP を調べる（Windows なら `ipconfig` の「IPv4 アドレス」）。
3. `.env` に `EXPO_PUBLIC_API_URL=http://<PC の IP>:3000` と書く。
4. `npm run dev:server` を立てる。スマホのブラウザで `http://<PC の IP>:3000/api/health` が開けるか確かめる（開けなければ、PC の防火壁（ファイアウォール）が 3000 番を通しているかを確かめる）。
5. それぞれのスマホを USB でつなぎ、`npm run android` で開発用のアプリを入れる（1台ずつ）。
6. `npm run dev` で Metro を立て、2台のアプリを開く。
7. 2台とも「はじめての人」でログイン → 片方で「子どもとして使う」（QR が出る）→ もう片方で「保護者として使う」（カメラで読む）→ 子どもの端末で「はい、入る」→ 保護者の端末で「1日の上限を決める」。

エミュレータの場合は `EXPO_PUBLIC_API_URL` を空のままにします（`10.0.2.2` が PC を指す）。

## 5. 使用時間（C2）を仮の値にする

`npm run android` で作った開発用のアプリには Kotlin の部品（`modules/kit-native/`）が入っていて、本物の使用時間を読みます（`getDailyUsage`。`engine/UsageReader.kt`。「使用状況へのアクセス」の許可が要る）。
Kotlin の部品がない環境（テスト・Kotlin を入れていないアプリ）では、子どもの画面は「使った時間を取得できませんでした」になります（0% とは出さない）。
そのときは `.env` に `EXPO_PUBLIC_FAKE_USAGE=1` を書いて Metro を立て直すと、仮の使用時間（YouTube・Instagram・X・ゲーム・学習ノート。時刻に合わせて増える）を返します。Kotlin の部品があるときは、`EXPO_PUBLIC_FAKE_USAGE=1` でも本物を読みます（`src/lib/native.ts`）。仮の値かどうかは `native.fake` で分かります。

## 6. Google ログインに切り替える

1. [google-login-setup.md](google-login-setup.md) の手順で Google Cloud に登録し、Web のクライアント ID をもらう（Android の登録に使うパッケージ名と開発版の署名の SHA-1 も、そこに書いてある）。
2. `.env` の `GOOGLE_WEB_CLIENT_ID` と `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` に同じ値を入れる。
3. `npm run android` でアプリを作り直す（Google ログインは端末側の部品を使う）。サーバも立て直す。
4. ログイン画面が「Google でログイン」だけになる。

- サーバは `MOCK=1` のままでも本物のトークンを確かめます（`mock-` のログインも受け付けたまま）。本番では `MOCK` を入れません（入れても `VERCEL_ENV=production` では無視します。`src/server/env.ts` の `isMock`）。
- サーバに `GOOGLE_WEB_CLIENT_ID` がないと、本物のトークンは `upstream_failed`「サーバに Google ログインの設定がありません」になります。

## テストの構成

テストは Vitest で、`tests/**/*.test.ts` を走らせます（`vitest.config.ts`）。テストのときは `MOCK=1` が入り、`expo/fetch` と AsyncStorage はメモリ上の代わり（`tests/stubs/`）に置き換わります。サーバは本物のネットワークを使わず `app.request` で呼びます。

- サーバのデータはメモリの上の PGlite（手元の DB）に入ります。`tests/verify/helpers.ts` の `fresh(nowIso)` が、テストごとに DB を空にして見本を入れ直します（`src/server/db/index.ts` の `resetDatabaseForTests`。Neon につないでいるときは動かない）。
- 時計は `Date` だけを偽物にします（`vi.useFakeTimers({ toFake: ["Date"] })`）。`clock.set`・`clock.addMs` で時刻を動かします。タイマーは本物のままなので、DB の処理は止まりません。
- PGlite は開くのに数秒かかるので、`hookTimeout` を 60 秒にしてあります。
- DB はテストのファイルごとに別々です。空の PGlite を作る（約7秒）のは重いので、全体の前に1回だけマイグレーションを当てた DB を作って一時ファイルに書き出し（`tests/setup/pglite-template.ts`。`vitest.config.ts` の `globalSetup`）、各ファイルはその写しから開きます（約1秒。`src/server/db/index.ts` の `connect` が `SLOPE_TEST_PGLITE_TEMPLATE` を見る。テストのときだけ）。
- 同時に走らせるファイルの数は CPU の数の 3 割（2〜6。`vitest.config.ts` の `maxWorkers`）に絞っています。既定（CPU の数 − 1）だと、DB を使う18ファイルが一度に DB を開き、PC が混んでいるときに最初のテストが 30 秒の時間切れになったためです。一時的に変えるときは `npx vitest run --maxWorkers=…`。

| フォルダ | 確かめること |
|---|---|
| `tests/lib/` | アプリの仕組み: 通信（`api.test.ts`）・C7（`config-cache.test.ts`）・日付の文言（`dates.test.ts`）・Kotlin の窓口（`native.test.ts`）・ログアウトで消すもの（`sign-out.test.ts`）・C3 と送る記録の形（`usage-calc.test.ts`）・C8（`usage-outbox.test.ts`） |
| `tests/server/` | サーバ: 契約と入口・ログイン・役割・紐づけ・計画・C7・C8・C9・エラー（`api.test.ts`）、C10（`daily-limits.test.ts`）、DB の決まり（`db.test.ts`）、合言葉・QR をハッシュで残すこと（`auth-pair-persistence.test.ts`）、本文の大きさの上限（`body-limit.test.ts`）、未来の測定時刻（`usage-clock.test.ts`）、利用記録の保存（`usage-db.test.ts`） |
| `tests/pair/` | ログイン・紐づけの画面の判断（`child-flow`・`parent-flow`・`link-check`・`usual-limit-and-login`） |
| `tests/child/` | 子どもの画面の判断（`child-view.test.ts`）、仮の使用時間から表示まで（`fake-usage.test.ts`） |
| `tests/schedule/` | 日程の判断（`logic.test.ts`）と、サーバにつないだ保存（`actions.test.ts`） |
| `tests/parent/` | 保護者の画面の判断（`charts`・`excluded`・`format`・`plan-form`・`review`・`today`） |
| `tests/verify/` | 確かめ役（V）: 決定 Q1〜Q14（`decisions`）・C10 の手計算（`c10-hand`）・C3/C7/C8 の境界（`c3-c7-c8`）・権限と安全（`security`）・Google のトークン（`google-token`）・ログアウト・子どもを外す・QR の番号を送る回数の上限（`revoke-and-limit`）。見つかって直した不具合は「V 回帰: 不具合1〜4」として `c3-c7-c8`・`decisions` に残してある。共通の道具は `helpers.ts` |
| `tests/stubs/` | テスト用の代わり（テストではない） |

### `npm run check`

```bash
npm run check   # = npm run lint（biome ci）→ npm run typecheck（tsc）→ npm run test（vitest run）
npm run fix     # 整形と並べ替えを自動で直す（biome check --write）
```

- 3つとも通ってから終える約束です。**テストを消す・飛ばす・期待値を実装に合わせて書き換える、で通さない**。
- `backend/` は別のプロジェクトなので、この検査には入りません（`backend/README.md` の手順で別に動かす）。

## 7. デモの前の注意

### 手元のサーバを立て直すと

`DATABASE_URL` がないときの `npm run dev:server` は、サーバのデータ（ログイン・紐づけ・計画・日程・利用記録）を手元の DB（PGlite）に入れ、フォルダ `state/pglite`（Git に入らない）に残します（`src/server/dev.ts`・`src/server/db/index.ts`）。止めた・ファイルを書き換えて立ち直ったときも、**合言葉と紐づけはそのまま**です。表の形は立ち上げのときに今のコードに合わせます。

- `MOCK=1` なら、手元の DB を開いたときにデモの3人と見本を入れます。もう入っていれば何もしません（`src/server/seed/demo.ts` の `seedMockAccounts`）。`DATABASE_URL` の DB（Neon）には、`MOCK=1` でも自動では入れません（D-126）。
- **見本だけに戻したいとき**: サーバを止めてから `state/pglite` のフォルダを消す。残したくないときは `MOCK_PERSIST=0`、置き場所を変えるときは `LOCAL_DB_DIR`。
- 合言葉と QR の番号は、DB にはハッシュ（SHA-256）でだけ残します（`src/server/auth/digest.ts`）。それでもフォルダは人に渡さないでください。
- ログアウトすると、その合言葉はサーバでも無効になります（`authSignOut`。D-90）。同じ人がもう一度ログインすれば、同じ人として新しい合言葉が出ます（紐づけはそのまま）。

以下は、フォルダを消した・`MOCK_PERSIST=0` で立て直したとき（データが見本だけに戻る）の動きです。

- **「はじめての人」で紐づけた2台**: 合言葉が無効になり、アプリはログイン画面に戻ります。もう一度ログインすると別の人として作られるので、**紐づけからやり直し**です。
- **デモの保護者・子ども**: 合言葉が固定なので、ログインしたままです。データは見本に戻ります（変えた計画や日程は消える）。設定の版も見本の版から数え直しますが、DB の `epoch` も変わるので、子ども・保護者の端末は次の取得で手元の組を捨てて新しい設定を取り込みます（D-109。前は「手元より古い版」として捨て続けたので、ログアウトが要った）。
- 同じ端末で別の人に切り替えるとき:
  - **保護者の端末・まだ紐づけていない端末**: 保護者の設定（親04）か入口 `/pair` の「ログアウト」を使います。その端末の設定のキャッシュが消えます（前の人の設定が混ざらない）。
  - **子どもの端末**: 子どもは自分でログアウトできません（D-136。子07 に「ログアウト」はない）。**保護者の端末で、親04 設定の「子どもとの連携を外す」を使います**（D-133）。子どもの端末は、アプリを開いていれば次の呼び出しで、閉じていても約1分（画面が消えていれば 15 分）以内に「保護者との連携が外れました」になり、監視が止まり、送信待ち・設定のキャッシュが消えます（Device Owner にしてあれば、それもやめる。[device-owner.md](device-owner.md)）。そのあと、新しい人でログインして QR で紐づけ直します。
  - **送り先が http の release 版では、外しても子どもの端末の監視は止まりません**（偽の返事で止められないように、`family_unlink` を信じるのは送り先が https か開発用のビルドのときだけ。SECURITY_TEST/fixes.md の M-8）。外して切り替えるデモは、dev client（`npm run android` で作った開発用のアプリ）か、https のサーバ（Vercel）で行ってください。
  - 子どもの端末（監視が動いている端末）で、役割のない人・保護者としてログインし直してからログアウトしても、監視は止まりません（保護者のウィジェットの値だけが消える。`/pair` に「ログアウト」も出ない。D-136）。
- 合言葉が無効になって（理由のない 401）ログイン画面に戻った子どもの端末も、監視は止まらず前の制限のまま動きます（D-133）。もう一度ログインして紐づければ、新しい設定に入れ替わります。
- 送信待ちに残っていた前の子どもの記録は、新しい子どもでは送れない（403）ので隔離され、自動では送り直されません。

### 見せ方のこつ

- サーバは PC で立てても、Vercel（Neon の DB）に置いてもよい。どちらも同じ DB の処理を通る。Vercel の本番では `MOCK` のログインが使えないので、Google でログインして QR で紐づけた親子に `npm run db:seed-demo` で見本を入れる（8章）。`DATABASE_URL` の DB には、`MOCK=1` でもデモの3人と見本は自動では入らない（D-126）。
- 子どもの端末は、Kotlin の部品の入った開発用のアプリなら本物の使用時間を出す（「使用状況へのアクセス」を許可する）。Kotlin の部品がないときは `EXPO_PUBLIC_FAKE_USAGE=1` で仮の使用時間を出す（5章）。
- 設定の変更は、子どもの画面が出ている間なら **30秒以内**に届きます（アプリを開き直す・前面に戻すとすぐ取りに行く）。画面が出ていないときの取得はまだない。
- QR は **10分**で切れます。
- **上限に届いたところを見せる**: 今日の日別上限を小さくする（例: 親02 で開始上限・最終目標を小さくして保存する。計画もテストもない子どもなら通常上限を小さくする）。上限 0 分は必ず到達になる。割合の表示は到達するまで最大 99% で、到達したときだけ 100% になります。子01 ホームが見えているときに子11 へ進みます（その日1回だけ）。ほかのアプリを使っている間も、Kotlin の監視（`MonitorService`）が上限に届いたら子11 を前に出します（「他のアプリの上に表示」の許可がなければ通知で案内する。`engine/LimitPrompt.kt`）。
- **親03 振り返りの文を Figma どおりにする**: 最終テスト終了日の翌日から通常上限に戻ります。中間テスト後は回復式で上限が一度戻ります。期間の帯の「前の試験 ◯/◯」は、今日より前に終わったテストがあるときだけ出ます（ないときは「計画の開始 ◯/◯」）。
- デモの子どもの計画は「14日前に始まった」見本です（本物の保存では開始日は今日以降）。親02 で計画を保存し直すと、開始日が今日になり、上限の下がり方が今日から始まり直します。
- 親16 の候補のアプリは、子どもの端末から届いたアプリ一覧です（Q15）。MOCK のデモの子どもには見本の一覧（学習ノート・英単語カード・動画アプリ・ゲーム・YouTube など。アイコンなし）が入っています。実機の子どもの端末で Slope を開くと、その端末の一覧とアイコンで置き換わります（Kotlin の `getLauncherApps` が要るので、アプリの作り直しが要ります）。

### つながらないとき

| 症状 | 確かめること |
|---|---|
| 「通信できませんでした」 | `EXPO_PUBLIC_API_URL` が PC の IP か・同じ Wi-Fi か・サーバが立っているか・Metro を立て直したか |
| ログイン画面に戻された（「ログインの期限が切れました」） | `state/pglite` を消した・`MOCK_PERSIST=0` で立て直していないか（上の「手元のサーバを立て直すと」）。30日使わなかった合言葉も無効になる（D-1） |
| 「開発用のログインはこのサーバでは使えません」 | サーバの `.env` に `MOCK=1` があるか |
| Google ログインで DEVELOPER_ERROR | [google-login-setup.md](google-login-setup.md) の「気をつけること」（パッケージ名・SHA-1・Web のクライアント ID）。release 版なら自分たちの鍵の SHA-1 を登録したか（[release-signing.md](release-signing.md)） |
| release 版を作ると「release 版を署名する鍵の設定が足りないので止めました」 | [release-signing.md](release-signing.md) の 1〜2（鍵と `~/.gradle/gradle.properties` の4つの値）。debug 版・dev client には要らない |
| 子どもの画面が「使った時間を取得できませんでした」 | `EXPO_PUBLIC_FAKE_USAGE=1` にして Metro を立て直したか |

## 8. Vercel の DB（Neon）を扱う

Vercel の本番・プレビューは、それぞれの環境の `DATABASE_URL`（Neon）を使います。値は `vercel env pull` で手元のファイルに取れます（Git に入れない）。

```bash
vercel env pull --environment=preview .env.preview.local
vercel env pull --environment=production .env.production.local
```

### 表の変更（migration）を入れる

`backend/drizzle/` に新しい migration があるときは、**コードを Vercel に出す前に**、プレビューと本番の両方の DB に入れます。新しいコードは新しい表・列があるものとして動くので、先にコードを出すと API が失敗します。

```bash
# 入れたい環境の DATABASE_URL を渡す（.env の空の DATABASE_URL より、ここで渡した値が使われる）
DATABASE_URL='<プレビューの DATABASE_URL>' npm run db:migrate
DATABASE_URL='<本番の DATABASE_URL>' npm run db:migrate
# PowerShell なら: $env:DATABASE_URL = '<URL>'; npm run db:migrate
```

> **注意（必ず先にやる）: この版（セキュリティ検査の直し・子どもを外す画面・2026-10-18）を出す前に、`0016_family_unlink_audit.sql`・`0017_rate_limit_hits.sql`・`0018_session_revoked_reason.sql` を、プレビューと本番の両方の DB に上の `npm run db:migrate` で入れてください。**
>
> 入れずにコードを出すと、`authGoogle`（ログイン）と `pairStart`（QR を出す）が表 `rate_limit_hits` が無くて **500 になり、だれもログインできなくなります**。`familyUnlink`（子どもを外す）も表 `audit_events` が無くて 500 になります。`0018` が無いと、列 `user_sessions.revoked_reason` が無くて、次が 500 になります: ログイン（`authGoogle`・MOCK のログイン。合言葉の行を足すとき、Drizzle は表の列をすべて並べるため）・ログアウト（`authSignOut`）・子どもを外す（`familyUnlink`）・**通らない合言葉での呼び出しすべて**（ふつうは 401 のところ。知らない合言葉・期限が切れた合言葉・無効にした合言葉、`authCheck` も含む。通らないときは `src/server/auth.ts` の `wasUnlinked` が無効にした理由を読むため）。
> 入れたあと、下の「出す前に確かめる SQL」で古いデータが残っていないかも確かめてください。

- `npm run db:migrate` は、まだ入っていない migration を番号の順に全部入れます。`0011_auth_rules_and_list_versions.sql`（QR の番号のまちがいの記録の表 `pair_claim_failures`、テスト期間・空白期間の一覧が最後に変わった版の列 `child_config_versions.test_periods_changed_version`・`blank_periods_changed_version`、設定の版を 0 から始める決まり）など前のものをまだ入れていなければ、それも一緒に入ります。
- `0016_family_unlink_audit.sql`: 表 `audit_events`（子どもを外した記録。D-138）。`0017_rate_limit_hits.sql`: 表 `rate_limit_hits`（ログイン・QR を出す回数の上限。D-131）。`0018_session_revoked_reason.sql`: 列 `user_sessions.revoked_reason`（合言葉を無効にした理由。連携を外された子どもの端末に、401 で理由を返すため。D-133。列を足すだけで、今ある行は NULL のまま）。
- 入れたかどうかは、Neon の表 `drizzle.__drizzle_migrations` に行が増えたかで分かります。

#### 出す前に確かめる SQL（範囲の外の古いデータ）

この版から、日付は 2000〜2099 年だけ（D-128）、アプリ名（パッケージ名）は Android の形だけ（D-129）を受け付けます。サーバは応答も契約で検査するので、**前の版で入った範囲の外のデータが DB に残っていると、それを返す API が出力の契約チェックで 500 `internal` になります**（入力の 400 ではありません）。Neon の SQL Editor（または `psql`）で、プレビューと本番の両方で流し、**件数がすべて 0** であることを確かめてください。0 でない表があれば、その行を直すか消してから出します。

```sql
-- 1. 日付が 2000-01-01〜2099-12-31 の外にある行の数（すべて 0 なら大丈夫）
SELECT 'test_periods' AS 表, count(*) AS 件数 FROM test_periods
  WHERE start_date NOT BETWEEN '2000-01-01' AND '2099-12-31' OR end_date NOT BETWEEN '2000-01-01' AND '2099-12-31'
UNION ALL SELECT 'blank_periods', count(*) FROM blank_periods
  WHERE start_date NOT BETWEEN '2000-01-01' AND '2099-12-31' OR end_date NOT BETWEEN '2000-01-01' AND '2099-12-31'
UNION ALL SELECT 'plan_settings', count(*) FROM plan_settings
  WHERE plan_start_date NOT BETWEEN '2000-01-01' AND '2099-12-31'
UNION ALL SELECT 'daily_limits', count(*) FROM daily_limits
  WHERE limit_date NOT BETWEEN '2000-01-01' AND '2099-12-31'
UNION ALL SELECT 'usage_day_reports', count(*) FROM usage_day_reports
  WHERE usage_date NOT BETWEEN '2000-01-01' AND '2099-12-31'
UNION ALL SELECT 'usage_records', count(*) FROM usage_records
  WHERE usage_date NOT BETWEEN '2000-01-01' AND '2099-12-31';

-- 2. アプリ名（app_id）が Android のパッケージ名の形でない行の数（すべて 0 なら大丈夫）
--    正規表現は contracts/schemas.ts の PackageName と同じ
SELECT 'excluded_apps' AS 表, count(*) AS 件数 FROM excluded_apps WHERE app_id !~ '^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$'
UNION ALL SELECT 'removed_excluded_apps', count(*) FROM removed_excluded_apps WHERE app_id !~ '^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$'
UNION ALL SELECT 'usage_records', count(*) FROM usage_records WHERE app_id !~ '^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$'
UNION ALL SELECT 'child_app_list_items', count(*) FROM child_app_list_items WHERE app_id !~ '^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$'
UNION ALL SELECT 'child_app_icons', count(*) FROM child_app_icons WHERE app_id !~ '^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$';
```

- この SQL は読むだけで、何も書き換えません。手元の PGlite（`backend/drizzle` の migration をすべて入れた DB）で、範囲の外の日付（`1999-12-31`・`9999-12-31`）と形の違うアプリ名（`a b`）を数えられることを確かめてあります。

#### この版を入れたら dev client を作り直す

この版では Kotlin（`modules/kit-native/`）が大きく変わりました。**dev client を `npm run android` で作り直してください**（画面の即時反映では入りません）。変わった Kotlin は次のとおりです。

| 変わったもの | 何のためか | 作り直さないと |
|---|---|---|
| `engine/UsageWindowCalculator.kt`・`ForegroundTime.kt`（前面の区間）・`UsageReader.kt` | D9 の検証（制限を外す時間帯と使用時間の重なり。[d9-usage-window-verification.md](d9-usage-window-verification.md)） | 検証用の処理が入らない（画面・API は変わらない） |
| `ForegroundTime.kt` の電源断 `DEVICE_SHUTDOWN` = 26 | 電源を切ったら前面の区間を閉じる（SECURITY_TEST/fixes.md の M-1） | D9 の検証の途中の版で作った dev client では、電源を切っても区間が閉じず、再起動の後まで前のアプリを使っていたことになる |
| `engine/SecretBox.kt`（`sealSecret`・`openSecret`） | 合言葉を Android Keystore の鍵で封をして置く（F-1） | 古い dev client には封の関数がないので合言葉を端末に置けず、起動のたびに何も言わずにログインし直しになる（開発中は Metro のログに「dev client を作り直してください（sealSecret がありません）」が1回出る。`src/lib/native.ts`） |
| `engine/EngineStore.kt`（合言葉は `report_token_sealed`・開けた合言葉はメモリにだけ持つ `OpenedSecretCache`） | 合言葉を平文で置かない（F-1）・見張りのたびに Keystore を使わない（M-12） | 合言葉が平文のまま残る |
| `LocalData.kt`（`clear`・`clearUnlinked`・`clearParent`） | ログアウト・連携が外れたときの片付けを1か所に | — |
| `engine/StatusReporter.kt`・`StatusReport.kt` | 許可の状態の送信が「連携が外れた」401（`reason: "family_unlink"`）を受けたら、アプリを開かなくても監視を止める（D-133）。信じるのは送り先が https か debuggable のときだけ（M-8） | アプリを開いたときに JS が同じ 401 を受けて止めるが、開くまでは制限が残る |
| `engine/SessionCheck.kt` | 監視が約1分ごとに `authCheck` で合言葉を確かめる（D-134） | 同上 |
| `releaseDeviceOwner`（`DeviceOwnerPolicy.release`） | 外されたときに Device Owner をやめる（D-133） | 外されても Device Owner のまま（[device-owner.md](device-owner.md) の 6章で解除する） |
| `isEngineEnabled`・`clearParentLocalData` | 監視が動いている端末では、ログアウトで監視を止めない（D-136。M-9） | 監視が動いているかは監視の Service が動いているかで代わりに見る。保護者のウィジェットの値はログアウトで消えない |

- 手元の DB（PGlite）は、立ち上げのときに表の形を自動で合わせるので、この作業は要りません。

### 本番の DB に見本を入れる（`npm run db:seed-demo`）

本番では `MOCK` のログインが使えないので、デモの見本は Google でログインして QR で紐づけた親子に入れます（`scripts/seed-demo.ts`）。デモの固定の合言葉は作りません。

```bash
# 1. 連携済みの親子の一覧を出す（何も書かない）
npm run db:seed-demo -- --env-file=.env.production.local
# 2. 一覧に出た子どもの userId を指定して、その親子に見本を入れる
npm run db:seed-demo -- --env-file=.env.production.local --child <子どもの userId>
```

- 入れるもの（`src/server/seed/demo.ts` の `seedDemoFamily`。`MOCK=1` の見本と同じ値）: 通常上限 180 分・14日前に始まった計画（開始上限 300 分・最終目標 120 分）・11〜13日先のテスト「数学」・対象外アプリ「学習ノート」・過去6日の利用記録。
- 計画・通常上限・テスト・対象外アプリは見本で上書きします。利用記録は、その日にもっと新しい測定があれば、そちらが残ります。
