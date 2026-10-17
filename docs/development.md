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
| `MOCK` | サーバ | `1` にすると `mock-` で始まるログイン（保護者・子ども・はじめての人）を受け付け、見本のデータを用意する（`src/server/mock/store.ts`）。**本番では入れない** | `1` |
| `DATABASE_URL` | サーバ | `src/server/db/`（ひな型の DB の接続口）が使う。空なら手元のメモリ上の Postgres（PGlite）。**今の API は使っていない** | 空 |
| `EXPO_PUBLIC_API_URL` | アプリ | アプリがつなぐサーバ。空なら `http://10.0.2.2:3000`（Android エミュレータから見た手元の PC）。実機なら PC の LAN の IP（例 `http://192.168.0.5:3000`） | 空（エミュレータ）／PC の IP（実機） |
| `GOOGLE_WEB_CLIENT_ID` | サーバ | 本物の Google ログインで、ID トークンの宛先（aud）として確かめる Web のクライアント ID | 空（MOCK のログイン） |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | アプリ | 上と同じ値。あればログイン画面が本物の「Google でログイン」になる。空なら MOCK のボタンを出す | 空 |
| `EXPO_PUBLIC_FAKE_USAGE` | アプリ | `1` にすると、Kotlin の部品がなくても仮の使用時間を返す（`src/lib/native.ts`） | デモでは `1` |
| `PORT` | サーバ | 手元のサーバの番号（`.env.example` にはない。なければ 3000） | 書かない |

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
- `npm run dev:server` は `tsx watch` です。**サーバのファイルを書き換えるとサーバが立ち直り、メモリのデータ（ログイン・紐づけ・日程など）は消えます**。
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

Kotlin の中身はまだないので、そのままでは子どもの画面は「使った時間を取得できませんでした」になります（0% とは出さない）。
`.env` に `EXPO_PUBLIC_FAKE_USAGE=1` を書いて Metro を立て直すと、仮の使用時間（YouTube・Instagram・X・ゲーム・学習ノート。時刻に合わせて増える）を返します。仮の値かどうかは `native.fake` で分かります。

## 6. Google ログインに切り替える

1. [google-login-setup.md](google-login-setup.md) の手順で Google Cloud に登録し、Web のクライアント ID をもらう（Android の登録に使うパッケージ名と開発版の署名の SHA-1 も、そこに書いてある）。
2. `.env` の `GOOGLE_WEB_CLIENT_ID` と `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` に同じ値を入れる。
3. `npm run android` でアプリを作り直す（Google ログインは端末側の部品を使う）。サーバも立て直す。
4. ログイン画面が「Google でログイン」だけになる。

- サーバは `MOCK=1` のままでも本物のトークンを確かめます（`mock-` のログインも受け付けたまま）。本番では `MOCK` を入れません。
- サーバに `GOOGLE_WEB_CLIENT_ID` がないと、本物のトークンは `upstream_failed`「サーバに Google ログインの設定がありません」になります。

## テストの構成

テストは Vitest で、`tests/**/*.test.ts` を走らせます（`vitest.config.ts`）。テストのときは `MOCK=1` が入り、`expo/fetch` と AsyncStorage はメモリ上の代わり（`tests/stubs/`）に置き換わります。サーバは本物のネットワークを使わず `app.request` で呼びます。

| フォルダ | 確かめること |
|---|---|
| `tests/lib/` | アプリの仕組み: 通信（`api.test.ts`）・C7（`config-cache.test.ts`）・日付の文言（`dates.test.ts`）・Kotlin の窓口（`native.test.ts`）・ログアウトで消すもの（`sign-out.test.ts`）・C3 と送る記録の形（`usage-calc.test.ts`）・C8（`usage-outbox.test.ts`） |
| `tests/server/` | サーバ: 契約と入口・ログイン・役割・紐づけ・計画・C7・C8・C9・エラー（`api.test.ts`）、C10（`daily-limits.test.ts`）、ひな型の DB（`db.test.ts`）、再起動後の版・日別上限の作り足し・QR の取り消し・対象外アプリの版（`store-lifecycle.test.ts`） |
| `tests/pair/` | ログイン・紐づけの画面の判断（`child-flow`・`parent-flow`・`link-check`・`usual-limit-and-login`） |
| `tests/child/` | 子どもの画面の判断（`child-view.test.ts`）、仮の使用時間から表示まで（`fake-usage.test.ts`） |
| `tests/schedule/` | 日程の判断（`logic.test.ts`）と、サーバにつないだ保存（`actions.test.ts`） |
| `tests/parent/` | 保護者の画面の判断（`charts`・`excluded`・`format`・`plan-form`・`review`・`today`） |
| `tests/verify/` | 確かめ役（V）: 決定 Q1〜Q14（`decisions`）・C10 の手計算（`c10-hand`）・C3/C7/C8 の境界（`c3-c7-c8`）・権限と安全（`security`）・Google のトークン（`google-token`）。見つかって直した不具合は「V 回帰: 不具合1〜4」として `c3-c7-c8`・`decisions` に残してある。共通の道具は `helpers.ts` |
| `tests/stubs/` | テスト用の代わり（テストではない） |

### `npm run check`

```bash
npm run check   # = npm run lint（biome ci）→ npm run typecheck（tsc）→ npm run test（vitest run）
npm run fix     # 整形と並べ替えを自動で直す（biome check --write）
```

- 3つとも通ってから終える約束です。**テストを消す・飛ばす・期待値を実装に合わせて書き換える、で通さない**。
- `backend/` は別のプロジェクトなので、この検査には入りません（`backend/README.md` の手順で別に動かす）。

## 7. デモの前の注意

### MOCK のサーバを立て直すと

サーバのデータはメモリだけなので、`npm run dev:server` を止めた・ファイルを書き換えて立ち直ったときは、すべて消えて見本だけに戻ります。

- **「はじめての人」で紐づけた2台**: 合言葉が無効になり、アプリはログイン画面に戻ります。もう一度ログインすると別の人として作られるので、**紐づけからやり直し**です。
- **デモの保護者・子ども**: 合言葉が固定なので、ログインしたままです。データは見本に戻ります（変えた計画や日程は消える）。設定の版はサーバの起動時刻から数えるので、前の起動の版より大きくなり、子どもの端末は新しい設定をそのまま取り込めます（[decisions.md](decisions.md) の D-53）。
- 同じ端末で別の人に切り替えるときは、設定の「ログアウト」を使ってください。ログアウトで、その端末の設定のキャッシュと、その人の送信待ちが消えます（前の人の設定や記録が混ざらない）。**子どもの端末でログアウトすると、まだ送っていない利用記録も消えます**。
- 送信待ちに残っていた前の子どもの記録は、新しい子どもでは送れない（403）ので隔離され、自動では送り直されません。

### 見せ方のこつ

- サーバは **PC で立てる**（Vercel には置かない。今のサーバはメモリにデータを持つので、Vercel では保存が残らない）。
- 子どもの端末は `EXPO_PUBLIC_FAKE_USAGE=1` で仮の使用時間を出す。
- 設定の変更は、子どもの画面が出ている間なら **30秒以内**に届きます（アプリを開き直す・前面に戻すとすぐ取りに行く）。画面が出ていないときの取得はまだない。
- QR は **10分**で切れます。
- **上限に届いたところを見せる**: 今日の日別上限を小さくする（例: 親02 で開始上限・最終目標を小さくして保存する。計画もテストもない子どもなら通常上限を小さくする）。上限 0 分は必ず到達になる。割合の表示は到達するまで最大 99% で、到達したときだけ 100% になります。子01 ホームが見えているときに子11 へ進みます（その日1回だけ）。Kotlin がないので、ほかのアプリの上に制限画面は出ません。
- **親03 振り返りの文を Figma どおりにする**: デモの子どものテストは「数学」1件だけなので、お知らせは「テスト（◯/◯）が最後のテストです。終わったあとも、上限は最終目標の 120分 のままです。」になります。**テストを2件以上登録する**（数学より後にもう1件）と、Figma と同じ「テスト（◯/◯）が終わると、上限は一度少し戻ります。」になります。期間の帯の「前の試験 ◯/◯」は、今日より前に終わったテストがあるときだけ出ます（ないときは「計画の開始 ◯/◯」）。
- デモの子どもの計画は「14日前に始まった」見本です（本物の保存では開始日は今日以降）。親02 で計画を保存し直すと、開始日が今日になり、上限の下がり方が今日から始まり直します。
- 親16 の候補のアプリ（学習ノートなど）は MOCK の固定の一覧です（Q15 保留）。

### つながらないとき

| 症状 | 確かめること |
|---|---|
| 「通信できませんでした」 | `EXPO_PUBLIC_API_URL` が PC の IP か・同じ Wi-Fi か・サーバが立っているか・Metro を立て直したか |
| ログイン画面に戻された（「ログインの期限が切れました」） | サーバを立て直していないか（上の「MOCK のサーバを立て直すと」） |
| 「開発用のログインはこのサーバでは使えません」 | サーバの `.env` に `MOCK=1` があるか |
| Google ログインで DEVELOPER_ERROR | [google-login-setup.md](google-login-setup.md) の「気をつけること」（パッケージ名・SHA-1・Web のクライアント ID） |
| 子どもの画面が「使った時間を取得できませんでした」 | `EXPO_PUBLIC_FAKE_USAGE=1` にして Metro を立て直したか |
