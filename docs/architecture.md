# 全体の作り（アーキテクチャ）

Slope がどんな部品でできていて、データがどこからどこへ流れるか、どんな約束で作っているかをまとめます。
言葉が分からないときは [README.md の言葉の表](README.md#言葉の表) を見てください。

## 1. 全体の構成図

```mermaid
flowchart LR
  subgraph PD["保護者のスマホ（Slope アプリ）"]
    PA["画面 src/app/parent/ と pair/"]
    PL["仕組み src/lib/（call・ParentDataProvider）"]
  end
  subgraph CD["子どものスマホ（Slope アプリ）"]
    CA["画面 src/app/child/ と pair/"]
    CL["仕組み src/lib/（call・ChildDataProvider・C3 の計算・送信待ち）"]
    CS[("端末の保存 AsyncStorage")]
    K["Kotlin の窓口 src/lib/native.ts → modules/kit-native（C2 使用時間・C4 監視と案内・C5 ウィジェット）"]
  end
  subgraph SV["サーバ（Hono）src/server/"]
    R["入口 app.ts・route.ts・auth.ts"]
    H["処理 handlers/"]
    SVC["services/・auth.ts と backend/src/db（保存）"]
    C10["C10 の計算 plan/daily-limits.ts"]
  end
  G["Google（ID トークンの公開鍵）"]
  DB[("Neon PostgreSQL / local PGlite")]

  PA --> PL
  CA --> CL
  CL --> CS
  CL --> K
  PL -- "HTTP（JSON）＋合言葉" --> R
  CL -- "HTTP（JSON）＋合言葉" --> R
  R --> H
  H --> SVC --> DB
  SVC --> C10
  R -.->|"ID トークンの署名を確かめる"| G
```

| 部分 | 何をするか | 主なファイル |
|---|---|---|
| 端末のアプリ | 画面を出し、サーバと通信する。保護者用・子ども用は同じアプリで、役割によって出す画面が変わる | `src/app/`・`src/components/`・`src/lib/` |
| Kotlin の窓口 | Android だけでできること（C2 使用時間の取得・C4 監視と制限画面）を呼ぶ入口。Kotlin の中身は `modules/kit-native/android/.../engine/`（Kotlin がない環境では安全な既定値） | `contracts/native.ts`・`src/lib/native.ts`・`modules/kit-native/` |
| Hono のサーバ | 窓口（API）を受け、ログインと権限を確かめ、データを保存し、上限を計算する | `src/server/` |
| サーバの処理 | ログイン・合言葉・QR の紐づけ・家族（`auth.ts`）、計画・日程・対象外アプリ・設定の組（`services/`）。保存は `backend/src/db/` の Drizzle の処理を呼ぶ | `src/server/auth.ts`・`src/server/services/`・`backend/src/db/` |
| DB | サーバのデータの置き場（すべての API が DB だけを通る）。Vercel では Neon（`DATABASE_URL`）、手元とテストでは PGlite（Node の中で動く Postgres）。表の設計は `backend/src/db/schema/`、変更の記録は `backend/drizzle/` | `src/server/db/index.ts`・`backend/` |
| 見本のデータ | `MOCK=1` のとき、DB を開いたときにデモの3人と見本を1回だけ入れる。本番の DB には `npm run db:seed-demo` で入れる | `src/server/seed/demo.ts`・`scripts/seed-demo.ts` |
| Google | 本物のログインのときだけ。サーバは Google の公開鍵で ID トークンの署名を確かめる | `src/server/auth/google.ts`・`src/lib/google.ts` |

### 本番と手元

- **本番は Vercel の Hono** です。リポジトリ直下の `server.ts` が `src/server/app.ts` をそのまま公開します（Vercel は直下の `server.ts` の default export を使う）。
- **手元**では `npm run dev:server`（`src/server/dev.ts`）が `http://localhost:3000` にサーバを立てます。同じネットワークのすべてのアドレスで待つので、実機やエミュレータからも届きます。
- **`backend/`** は Drizzle の表の設計（`src/db/schema/`）・保存の処理（`src/db/*.ts`）・migration（`drizzle/`）です。独立した npm のプロジェクトで、ルートの型の検査・整形の検査（`npm run check`）からは外してあります（`tsconfig.json`・`biome.json` の `backend` の除外）。サーバは `backend/src/db/` の処理をそのまま import して使います。
- 注意: Vercel では関数のメモリにデータを置いても残らない（呼ぶたびに別のインスタンスになりうる）ので、サーバはデータをメモリに持ちません。QR の番号のまちがいの数なども DB の表に数えます（`src/server/db/index.ts` のコメント）。表を変えたときは、コードを出す前に Neon に migration を入れます（[development.md の 8章](development.md#8-vercel-の-dbneonを扱う)）。

## 2. フォルダごとの役割

| フォルダ・ファイル | 役割 |
|---|---|
| `contracts/` | **契約（型）**。アプリとサーバの両方がここだけを見てつながる。`api.ts`（API の表）・`schemas.ts`（データの形）・`errors.ts`（エラーの形と文言）・`dates.ts`（日付の計算と、画面に出す日付の文言）・`fixtures.ts`（MOCK の人と見本のデータ）・`native.ts`（Kotlin の窓口の型）・`tokens.ts`（色・余白・文字の大きさ） |
| `src/server/app.ts` | サーバの入口。`contracts/api.ts` の表をそのまま Hono の道につなぐ（道を手書きしない） |
| `src/server/route.ts` | API 1本ぶんの処理の枠（`handle()`）。ログインの確認 → 入力の検査 → 子どもの範囲の確認 → 処理 → 出力の検査、の順に必ず通す |
| `src/server/auth.ts`・`auth/google.ts`・`auth/digest.ts` | 合言葉から「呼んだ人」を決める・役割を確かめる・子どもの範囲を確かめる。ログイン・ログアウト・QR の紐づけ・家族（外すことも）。Google の ID トークンの検証。合言葉と QR の番号は SHA-256 のハッシュでだけ DB に残す（`digest.ts`） |
| `src/server/handlers/` | API 1本につき1ファイル（名前は API 名と同じ）。中身はほぼ `auth.ts`・`services/`・`backend/src/db/` を呼ぶだけ |
| `src/server/services/` | 計画・通常上限・テスト期間・空白期間・対象外アプリ・設定の組（C7）の処理。権限の確かめと、`backend/src/db/` の保存の処理の呼び出し |
| `src/server/seed/demo.ts` | 見本のデータを DB に入れる（`seedMockAccounts`・`seedDemoFamily`） |
| `src/server/plan/daily-limits.ts` | C10 の日別上限の計算（純粋な関数） |
| `src/server/env.ts`・`errors.ts`・`dev.ts` | 環境変数の読み取り・サーバのエラー（`AppError`）・手元用のサーバ |
| `src/server/db/` | Honoの共通DB接続口。`backend/src/db/schema` とリポジトリを使い、手元・テストは PGlite（手元のサーバは `state/pglite` に残す）、Vercel は Neon へ接続する |
| `src/lib/` | アプリ側の仕組み。`api.ts`（通信）・`session.tsx`（ログイン状態）・`google.ts`（Google ログイン）・`storage.ts`（端末の保存）・`config-cache.ts`（C7）・`usage-calc.ts`（C3）・`usage-outbox.ts`（C8）・`native.ts`（Kotlin の窓口）・`polling.ts`（30秒ごとの取得）・`flow.tsx`（画面の間の受け渡し）・`child-data.tsx`・`parent-data.tsx`（子ども用・保護者用のデータの共有）・`sign-out.ts`（ログアウトで端末のデータを消す） |
| `src/components/` | 共通の部品（`Screen`・`Card`・`Button`・`StateView` など）。`child/`・`pair/`・`parent/`・`schedule/` は機能ごとの部品と、画面の判断をまとめた純粋な関数 |
| `src/app/` | 画面（Expo Router。ファイルの場所がそのまま道になる）。`index.tsx`（入口）・`login.tsx`・`pair/`・`child/`・`parent/` |
| `modules/kit-native/` | Kotlin のモジュール（Expo Modules）。`engine/`（C2 使用時間・C4 監視の Foreground Service と案内・再起動後の再開）、`widget/`（C5）、`admin/`（Device Owner。デモ専用） |
| `tests/` | Vitest のテスト。フォルダの分け方は [development.md](development.md#テストの構成) |
| `backend/` | DB の表の設計・保存の処理・migration（別のプロジェクト） |
| `scripts/seed-demo.ts` | 本番・プレビューの DB に見本を入れる（`npm run db:seed-demo`。[development.md の 8章](development.md#8-vercel-の-dbneonを扱う)） |
| `metro.config.js` | アプリのまとめ（Metro）の設定。`contracts/` の `./errors.js` のような import を、見つからなければ拡張子なしで探し直す（Vercel の Node のために `.js` を付けているため） |
| `server.ts` | Vercel の入口（`src/server/app.ts` を公開するだけ） |
| `app.json` | Expo の設定。名前 `Slope`・scheme `slope`・Android だけ・使う部品（カメラ・日付の選択・Google ログイン） |
| `.env.example` | 手元用の環境変数の見本（[development.md の「環境変数の項目」](development.md#環境変数の項目)） |
| `android/`・`tmp/` | Git に入れない（`android/` は `npx expo prebuild` / `npm run android` が作り直す生成物） |

コードの中では `@/…` が `src/…`、`@contracts/…` が `contracts/…` を指します（`tsconfig.json` の `paths`）。

## 3. データの流れ

### 保護者が設定を変えて、子どものスマホに届くまで

```mermaid
sequenceDiagram
  participant P as 保護者のアプリ
  participant S as サーバ
  participant C as 子どものアプリ
  P->>S: planSave など（expectedVersion つき）
  Note over S: DB-backed: expectedVersion とD3/D8/C9の更新を同一transactionで保存
  Note over S: D3/D8更新とC10計算・D6/計算版保存を1つのDB transactionで行う
  S-->>P: 新しい configVersion・calculationVersion
  loop 画面が出ている間 30秒ごと
    C->>S: configGet（knownVersion = 手元の版）
    Note over S: 子どもが送った版を「子どもが使っている版」として覚える
    S-->>C: 変わっていれば新しいスナップショット
  end
  P->>S: planGet など
  S-->>P: configVersion と childAppliedVersion → 反映済み／反映待ち
```

### 子どもが使った時間が、保護者の画面に出るまで

```mermaid
sequenceDiagram
  participant K as Kotlin の窓口（C2）
  participant C as 子どものアプリ
  participant S as サーバ（DB）
  participant P as 保護者のアプリ
  C->>K: getDailyUsage（今日・昨日）
  K-->>C: アプリ別の分数（取れなければ unavailable）
  Note over C: C3 で割合と到達を計算して画面に出す（端末の中だけ）
  Note over C: 今日と昨日の記録を送信待ちに入れる（送信 ID つき）
  C->>S: usageUpload
  S-->>C: accepted / duplicate → 送信待ちから消す
  loop 30秒ごと
    P->>S: usageGet（期間）
    S-->>P: 日ごとの分数・その日の上限・記録の有無
  end
```

## 4. 設計の原則と、守っている場所

| 原則 | なぜ | コードのどこで守っているか |
|---|---|---|
| **割合・到達の判定は子どもの端末の中で行う** | 電波がなくても判定できるように。親の画面で設定を変えても、過去の記録を計算し直さないように | C3 は `src/lib/usage-calc.ts` の `calcUsage`。判定の値は `src/lib/child-data.tsx` が `native.saveRestriction` で Kotlin に渡す（Kotlin は端末に保存した値で、オフラインでも・画面が閉じていても判定する。`engine/MonitorService.kt`）。親の画面は端末が送った `restrictedMinutes`（制限対象の合計）をそのまま使う |
| **親の権限はサーバで確かめる（画面で隠すだけにしない）** | 子どもが保護者の操作をする・他人の子どもを見る、を防ぐ（AC-04・AC-13） | API ごとの `auth` は `contracts/api.ts`。毎回 `src/server/route.ts` の `prepare` が `auth.ts` の `authorize`（役割）と `checkChildAccess`（子どもは自分だけ・保護者は連携済みの子どもだけ・紐づけ前は何も扱えない）を呼ぶ。テストは `tests/verify/security.test.ts`・`tests/server/api.test.ts` |
| **画面はサーバと `call()` だけで話す** | 道（path）の打ち間違い・合言葉の付け忘れ・エラーの形のばらつきを防ぐ | `src/lib/api.ts` の `call()` / `stream()`。`fetch` はここにしかない。道は `contracts/api.ts` の表から引く。サーバ側も `src/server/app.ts` が同じ表から道を作り、表に処理が足りないと型の検査で落ちる |
| **取れない値を 0 にしない** | 「0 分使った」「0 分まで」と「分からない」を取り違えると、子どもを誤って止めたり、親が誤解したりする | 使用時間は `NativeUsageResult` の `unavailable`・`permission_denied`（`contracts/native.ts`）。C3 は `UsageCalc` の状態を分ける。設定は `ConfigState` の `unavailable`（`config-cache.ts`）。親の実績は `UsageDay.recorded: false`。画面は `StateView`・`Gauge`（`null` は「--」）・件数は出さない（`countText`・`testCountLabel`） |
| **「制限なし」「上限未設定」「0 分」を型で分ける** | 3つとも「制限しない／できない」ように見えるが意味が違う（Q7） | `DayLimit`・`DailyLimit` の `kind`（`contracts/schemas.ts`）、`LimitInput`（`usage-calc.ts`）、`NativeRestriction.limit`（`contracts/native.ts`）。詳しくは [data.md の 2章](data.md) |
| **保存はサーバの確定を待ってから「成功」と出す** | 押しただけで成功と出すと、届かなかったときに嘘になる（MVP_SPEC 5.3） | `Button` の `loading` で二重に押せない。日程は `PeriodEditor`、計画は `plan.tsx`（`saveConfirmation`）、紐づけは `linked` を見るまで成功を出さない（`child-flow.ts`・`parent-flow.ts`） |
| **入口と出口の両方を契約で検査する** | 形の違うデータで処理が進まないように | サーバは `route.ts` で入力（400）と出力（500 = サーバの不具合）を検査。アプリは `call()` で応答を検査 |
| **DB-backedの設定書き込みは版と同じ transaction で保存する** | 途中失敗時に設定と版の不一致を防ぐ | `backend/src/db` repositories と `c10-recalculate.ts`。D3/D8/空白期間/通常上限の更新時にC10日別上限と計算版を同一 transaction で保存する。C7 snapshot はこの計算結果を読む |
| **版で取り違えを防ぐ** | 別の端末が先に変えたのに上書きする・古い設定と新しい設定を混ぜる、を防ぐ（Q6） | 書く API は `expectedVersion` を受け、ずれていたら `conflict`（`backend/src/db/*.ts` の保存の処理が、版の確かめ・保存・版を上げるを1回の DB の処理（トランザクション）で行う）。端末は版の違う組を混ぜない（`config-cache.ts` の `reconcileConfig`） |
| **日付はAPI契約のcalendar-dateとして検証する** | 日本時間0時を日付境界とし、設定変更は翌日から適用 | `contracts/dates.ts` と `c10-recalculate.ts` |
| **計算・判断は画面から切り離した純粋な関数にしてテストする** | 画面を動かさなくても正しさを確かめられるように | C10 `daily-limits.ts`、C3 `usage-calc.ts`、C7 `reconcileConfig`、C8 `createUsageOutbox`、紐づけの表示 `child-flow.ts`・`parent-flow.ts`・`link-check.ts`、画面の文言 `child-view.ts`・`schedule/logic.ts`・`parent/*.ts` |
| **見た目は `contracts/tokens.ts` の名前だけ** | 色や余白をそろえ、あとで変えやすくする | 色はテーマ（白色・黒色）ごとに2組で、画面は `src/lib/theme.tsx` の `makeStyles`・`useColors` から `c.primary` のように使う。`style={{…}}` と色コードの直書きはない（自動の検査はなく、書く人が守る約束） |
| **Android 固有の処理は窓口を通す** | Kotlin がない環境（テスト・Expo Go）でも落ちない。将来 iOS に差し替えられる | `src/lib/native.ts` が `KitNative` を名前で探し、なければ安全な既定値（権限なし・使用時間は取得不可・制限画面は出せない）を返す |

## 5. 端末に残すもの

`src/lib/storage.ts` の `storageKeys` にだけキーを書きます（アプリを閉じても消えない。AsyncStorage）。

| キー | 中身 | 消えるとき |
|---|---|---|
| `slope.session` | ログインした人（合言葉を含む `Session`） | ログアウト・サーバが 401 を返したとき |
| `slope.config.<childId>` | C7 の最後に正常だったスナップショットと、それをくれたサーバの DB の `epoch`（`CachedConfig`。epoch が違う応答が来たら置き換える。D-109） | ログアウトのとき全部（`configCache.clearAll`）。401 では消さない |
| `slope.config-index` | 設定のキャッシュを持っている子どもの一覧（`clearAll` で全部消すため。保存の仕組みにキーの一覧を取る手段がないので自分で持つ） | ログアウトのとき |
| `slope.usage-outbox` | C8 の送信待ち | 送れた分だけ消える。ログアウトのときは、その人（子ども）の分だけ消す（`usageOutbox.removeChild`）。401 では消さない（同じ人がログインし直して送れるように） |
| `slope.child-apps.<childId>` | Q15 で前に送ったアプリの一覧（packageName・表示名・アイコンのハッシュ）と、そのときの C7 の `epoch`（変わったときだけ送るため。`src/lib/child-apps-sync.ts`） | ログアウトのとき（`childAppsSync.clear`） |
| `slope.mock-device-id` | MOCK の「はじめての人」をこの端末だけの人にする番号 | 消さない |

読むときは Zod で形を確かめ、壊れていたら「ない」として扱います（`readJson`）。

**ログアウトで消すもの**（`src/lib/sign-out.ts` の `clearLocalDataFor`。`session.tsx` の `signOut` が呼ぶ）: 設定のキャッシュ全部と、ログアウトした人の送信待ち。同じ端末で別の人がログインし直したときに、前の人の設定や記録が混ざらないようにするためです。合言葉の期限切れ（401）では呼びません。消す前に、合言葉をサーバでも無効にします（`revokeServerSession` → `authSignOut`。通信できなくてもログアウトは進める。401 のときは呼ばない）。

## 6. まだ無いもの

- **ウィジェット（C5）**。MVP の後。ダークテーマ（テーマカラーの「黒色」）はアプリの画面だけで、ウィジェットは白のまま。
- **画面が出ていないときの予備の取得（15分ごと）**。`src/lib/polling.ts` の `TODO(未決)`。今は画面が前に出ている間だけ取りに行く。
