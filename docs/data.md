# データの形と計算

アプリとサーバで受け渡すデータの形（`contracts/schemas.ts`）、上限の3つの状態の区別、日付の扱い、上限の計算（C10）、サーバのデータの置き場（MOCK の store）、DB の表との対応をまとめます。

## 1. 主要な型

すべて `contracts/schemas.ts` に Zod で書いてあり、アプリとサーバの両方が同じ型を使います（id は文字列、日付は `"YYYY-MM-DD"`）。

### 共通の部品

| 型 | 形 | 決まり |
|---|---|---|
| `IsoDate` | `"2026-10-17"` | 実在する日付だけ。日本時間の「その日」 |
| `IsoDateTime` | `"2026-10-17T10:00:00.000Z"`・`"2026-10-17T19:00:00+09:00"` | タイムゾーンつきの本当の日時だけ（`z.iso.datetime({ offset: true })`）。タイムゾーンのない日時は端末の地域で意味が変わるので受け付けない |
| `Minutes` | 整数 | 0〜1440。**0 分は有効な上限**（その日は使えない） |
| `ConfigVersion` | 整数 | 0 以上。設定の版 |
| `PackageName` | `"com.google.android.youtube"` | Android のアプリの識別子（1〜255 文字） |
| `ChildQuery` | `{ childId }` | 「どの子どもの話か」。サーバが必ず扱えるか確かめる |
| `ChildAppliedVersion` | 版 または `null` | 子どもの端末が使っている版。まだ一度も取りに来ていなければ `null` |

### ログインと家族（C1・D1・D2）

| 型 | 中身 | 説明 |
|---|---|---|
| `Role` | `"parent"` / `"child"` | 役割 |
| `Session` | `token`・`userId`・`name`・`role`（`null` あり） | ログインの結果。`role` は紐づけが確定するまで `null`。子どもの `name` は、紐づけの確定後は QR を出すときに入れた呼び名（`PairStart.name`。省けば Google のアカウント名） |
| `Child` | `id`・`name` | 子ども1人（`id` は子どもの userId） |
| `PairState` | `waiting`・`claimed`・`linked`・`expired`・`rejected` | QR の紐づけの進み具合 |
| `PairTicket` | `pairId`・`code`・`expiresAt` | QR に入れるのは `code`（使い捨ての番号）だけ。合言葉や個人情報は入れない |
| `PairStatus` | `pairId`・`state`・`child`・`parentName`・`expiresAt` | 進み具合。`parentName` は読んだ保護者の名前（`claimed` 以降） |
| `LinkStatus` | `state`（`linked`／`unlinked`）・`role`・`partners` | D2 に保存が確定した連携状態 |
| `Family` | `children` | 保護者の家族。MVP は最大1人だが形は一覧（Q2） |

### 上限・計画・期間（D3・D6・D8・空白期間）

| 型 | 中身 | 説明 |
|---|---|---|
| `DayLimit` | `{ kind: "limited", limitMinutes }` または `{ kind: "unlimited", blankPeriodId }` | 1日の上限の値。値がないこと（`null`・一覧にない）が「上限未設定」 |
| `DailyLimit` | `DayLimit` ＋ `date` | 日別上限1日ぶん（D6）。C10 が作る |
| `PlanSettings` | `planStartDate`・`startLimitMinutes`（S）・`finalGoalMinutes`（G）・`childId`・`version`・`updatedAt` | 保存済みの計画（D8） |
| `PlanView` | `plan`（`null` あり）・`usualLimitMinutes`（`null` あり）・`configVersion`・`childAppliedVersion` | 計画の取得結果 |
| `PlanSave` | 計画の3つ ＋ `childId`・`expectedVersion`・`usualLimitMinutes?` | G ≤ S を契約で確かめる |
| `ConfigChange` | `configVersion`・`calculationVersion` | 設定を変えた結果の共通部分 |
| `TestPeriod` | `id`・`name`・`startDate`・`endDate`・`createdByUserId`・`createdByRole` | テスト期間（D3）。名前は前後の空白を取って 1〜120 文字、終了日 ≥ 開始日 |
| `BlankPeriod` | `id`・`name`・`startDate`・`endDate` | 空白期間（夏休みなど）。期間中は「制限なし」 |
| `ExcludedApp` | `packageName`・`label`・`sinceVersion` | 制限対象外アプリ（D7）。`sinceVersion` は対象外になった版 |
| `RemovedExcludedApp` | `packageName`・`label`・`removedVersion` | 対象外から外したアプリと、外した版。もう一度対象外にしたら一覧から消える |
| `ExcludedAppsView` | `childId`・`apps`・`removedApps`・`appsChangedVersion`・`configVersion`・`childAppliedVersion` | 対象外アプリの取得結果。`appsChangedVersion` は一覧（アプリの組と名前）が最後に変わった版（一度も変わっていなければ 0）。親16 の「反映済み／反映待ち」をサーバの値だけで決めるため |

### 設定の組（C7）

| 型 | 中身 | 説明 |
|---|---|---|
| `ConfigSnapshot` | `childId`・`configVersion`・`calculationVersion`・`usualLimitMinutes`・`plan`・`testPeriods`・`blankPeriods`・`dailyLimits`・`excludedApps`・`generatedAt` | 端末が丸ごと採用する1組。中はすべて同じ版のもの |
| `ConfigQuery` | `childId`・`knownVersion?` | 取得の入力 |
| `ConfigResult` | `{ changed: false, configVersion }` または `{ changed: true, snapshot }` | 取得の結果 |

### 利用記録（C8・C6・D4）

| 型 | 中身 | 説明 |
|---|---|---|
| `AppMinutes` | `packageName`・`label`・`usedMinutes`・`excluded` | 1アプリのその日の累計。`excluded` は測ったときに対象外（または必須例外）だったか |
| `UsageDayReport` | `date`・`measuredAt`・`restrictedMinutes`・`apps`（1000件まで） | 1日ぶんの利用記録（Q8）。`restrictedMinutes` は制限対象の合計 |
| `UsageUpload` | `submissionId`（UUID）・`childId`・`days`（1〜7日分） | 送信 |
| `UsageUploadResult` | `submissionId`・`status`（`accepted`／`duplicate`）・`appliedDates` | 送信の結果 |
| `UsageQuery` | `childId`・`from`・`to` | 親が見る期間（両端を含む。190日未満） |
| `UsageDay` | `date`・`recorded`・`usedMinutes`・`measuredAt`・`limit`・`apps` | 親が見る1日ぶん。記録がない日は `recorded: false`・`usedMinutes: null` |
| `ParentUsageView` | `childId`・`from`・`to`・`days`・`lastUploadedAt` | 親が見る実績。`days` は from〜to の全日 |

### 端末の中だけの型（サーバとは受け渡さない）

| 型 | 場所 | 説明 |
|---|---|---|
| `NativeUsageResult` | `contracts/native.ts` | C2 の結果。`ok`（`apps` が空 = 本当に使っていない）／`permission_denied`／`unavailable` |
| `NativeRestriction` | `contracts/native.ts` | C4 の判定に Kotlin へ渡す値。`limit` は `limited`／`unlimited`／`unset` |
| `LimitInput` | `src/lib/usage-calc.ts` | C3 に入れる当日の上限。`set`／`unlimited`／`unset`／`unknown` |
| `UsageCalc` | `src/lib/usage-calc.ts` | C3 の結果。`ok`／`unlimited`／`permission_denied`／`usage_unavailable`／`limit_unset`／`limit_unknown`／`limit_invalid` |
| `ConfigState` | `src/lib/config-cache.ts` | 端末が持つ設定。`fresh`／`stale`（理由つき）／`unavailable` |

## 2. 「制限なし／未設定／0 分」の区別

3つとも「その日は割合を出さない・制限しない」ように見えますが、意味が違うので**型で分けて**取り違えないようにしています（Q7）。

| 状態 | 意味 | いつ起きる |
|---|---|---|
| **上限 0 分** | 有効な上限。その日は使えない（使った時点で到達） | 保護者が 0 分を決めた・計算で 0 分になった |
| **制限なし** | 空白期間（夏休みなど）の日。使っても到達しない | 保護者が空白期間を登録した |
| **上限未設定** | 保護者がまだ決めていない。その日の値がない | 紐づけ直後に通常上限を「あとで決める」にした・計画もテストもない |
| （取得不可） | 端末が設定を一度も取れていない | 通信できず、キャッシュもない |

それぞれの場所での書き方:

| 場所 | 上限 0 分 | 制限なし | 上限未設定 | 取得不可 |
|---|---|---|---|---|
| サーバの日別上限 `DailyLimit`（`schemas.ts`） | `{ kind: "limited", limitMinutes: 0 }` | `{ kind: "unlimited", blankPeriodId }` | その日付が一覧にない | — |
| 親の実績 `UsageDay.limit` | `limited` 0 | `unlimited` | `null` | （通信の失敗は画面で `StateView` の unknown） |
| C3 の入力 `LimitInput`（`usage-calc.ts` の `limitForDate`） | `{ kind: "set", minutes: 0 }` | `{ kind: "unlimited" }` | `{ kind: "unset" }` | `{ kind: "unknown" }` |
| C3 の結果 `UsageCalc` | `ok`（100%・到達） | `unlimited`（使った分だけ持つ） | `limit_unset` | `limit_unknown` |
| Kotlin に渡す `NativeRestriction.limit` | `limited` 0 | `unlimited` | `unset` | 渡さない（前の値を使う） |
| 子どもの画面（`child-view.ts`） | 100% 使いました | 今日は制限なし（期間の名前） | 上限がまだ決まっていない旨 | 取得できなかった旨と「もう一度ためす」 |
| 保護者の画面（`today.ts`・`charts.ts`） | 上限 0分 | 制限なし・グラフの上は「なし」 | 上限未設定・グラフの上は「－」 | 取得不可（もう一度ためす） |

同じように、**使った時間**も「記録なし」と「0 分」を分けます。

| 状態 | サーバ（`UsageDay`） | 子どもの端末（`NativeUsageResult`） | 画面 |
|---|---|---|---|
| 0 分使った | `recorded: true`・`usedMinutes: 0` | `ok` で `apps` の分数が 0・または空 | 0 分・0% |
| 記録が届いていない | `recorded: false`・`usedMinutes: null` | — | 「まだ記録が届いていません」・グラフは「？」 |
| 取れない | — | `unavailable`・`permission_denied` | 取得できなかった旨・権限の案内（0% と出さない） |

テスト期間が0件でも「上限未設定」ではありません。計画があってもテストが0件なら、通常上限を使います（MVP_SPEC 4.3）。

## 3. 日付

- **日本時間（Asia/Tokyo）固定・0時区切り**です（Q3）。「今日」を出すのは `contracts/dates.ts` の `todayString` だけ（日本は夏時間がないので UTC+9 で計算する）。サーバの store も `todayString(this.now())` を使う。
- 日付は時刻を持たない文字列 `"YYYY-MM-DD"` として扱い、計算は UTC の 0 時に置いて行う（端末の時計の地域に左右されない）。

| 関数（`contracts/dates.ts`） | すること |
|---|---|
| `dateOf(時刻)` | その時刻が日本時間で何日か（UTC 14:59:59 は同じ日、15:00:00 は翌日） |
| `todayString()` | 今日 |
| `addDays(日付, n)` | n 日後（負なら前） |
| `daysBetween(a, b)` | b − a の日数 |
| `datesInRange(from, to)` | from〜to（両端を含む）の日付の一覧 |
| `mondayOf(日付)` | その週の月曜日（週は月曜〜日曜） |
| `weekdayJa(日付)` | 曜日の1文字（月・火…） |
| `formatDateJa(日付)` | 「10月28日（水）」 |
| `formatDateLongJa(日付)` | 「2026年10月28日（水）」（日付の入力欄 `DateField` はいつもこの年つきの形） |
| `formatSlashDate(日付)` | 「10/12」（グラフの下の日付・期間の帯） |
| `formatSlashDateWeekday(日付)` | 「10/15（木）」 |

画面に出す日付の文言は、このファイルの関数だけで作ります（日付の文字列をそのまま読むので、端末の時計の地域に左右されない）。

- テスト期間・空白期間の**終了日はその日を含む**として計算しています（`TODO(未決)`。[open-questions.md](open-questions.md)）。
- 画面の日付の入力（`src/components/DateField.tsx`）も、日本時間の「その日」として受け渡します（正午で受け渡す）。

## 4. C10 日別上限の計算

担当: `src/server/plan/daily-limits.ts` の `computeDailyLimits`（純粋な関数）。保存は `src/server/mock/store.ts` の `recalculate`。

### 入力

- 通常上限（`null` = 未設定）
- 計画: 計画開始日 d0・開始上限 S・最終目標 G（`null` = まだない）
- テスト期間の一覧・空白期間の一覧

### 式（MVP_SPEC 4.4）

- 基準曲線: **B(d) = S − (S − G)·u²**、u = clamp((d − d0) ÷ D, 0, 1)。D = d0 から**最後のテストの開始日**までの日数。
- テスト i の開始日の目標 Qᵢ = B(開始日)。最後のテストだけは Q = G。**テスト期間中は Qᵢ を維持**する。
- 最後のテストが始まったら G。終わった後もずっと G。
- 最後ではないテストの終了後（回復）:
  - rᵢ = clamp(0.8 × (1 − u_end²), 0, 0.8)（u_end はテスト終了日の u）
  - Rᵢ = Qᵢ + rᵢ × (Pᵢ − Qᵢ)（Pᵢ は前の回復のピーク。最初は P = S）
  - 終了の翌日を Rᵢ とし、次のテストの開始日の目標まで**実際の日数で直線**に下げる。次の回の P は Rᵢ。
- 連続したテスト（終了の翌日が次の開始日）では回復しない。
- 途中は丸めずに計算し、最後に分の整数へ丸める（今は四捨五入）。0〜1440 に収める。

### 決まり（仮のものを含む）

| 場合 | 今の動き |
|---|---|
| 計画がない | すべての日が通常上限（通常上限も未設定なら、すべて「上限未設定」） |
| 計画はあるがテストが0件 | すべての日が通常上限 |
| 計画開始日より前の日 | 通常上限（仮。引数 `beforePlanStart` で S にもできる） |
| 最初のテストより前の日 | 基準曲線 B(d) のまま（仮。引数 `firstSegment` で S → Q₁ の直線にもできる） |
| 計画開始日より前に始まるテスト | 計算に使わない（仮） |
| テスト期間どうし・空白期間どうしが重なる | 計算できない入力（保存は `bad_request`。前の版を保つ） |
| D = 0（計画開始日に最後のテストが始まる） | S = G ならすべて S。S ≠ G なら計算できない入力 |
| 空白期間の日 | 上の計算に関係なく「制限なし」。終わった日から元の上限に戻る |
| 何日先まで作るか | 保存した日から 120 日先まで（仮。`store.ts` の `LIMIT_HORIZON_DAYS`）。それより先は「上限未設定」。残りが 60 日（`LIMIT_TOPUP_MIN_DAYS`）を切ったら、`configGet` のときに今日から 120 日先まで作り足す（`topUpDailyLimits`。昨日以前は変えない。中身が変わったときだけ版が 1 上がる） |
| 計算し直す範囲 | 今日から先だけ。昨日以前は前の値のまま（`mergeWithFinalized`。Q4） |

仮の点は [open-questions.md](open-questions.md) の Q16 にまとめてあります。

### 手計算の例

`tests/verify/c10-hand.test.ts` の例です。計画開始日 d0 = 2026-10-01、S = 300、G = 60、通常上限 180。
テスト1 = 10/20〜10/22（途中）、テスト2 = 11/10〜11/12（最後）、空白期間 = 12/20〜2027-01-07。
D = 10/01 から 11/10 まで = 40 日。B(d) = 300 − 240·u²、u = (d − 10/01) ÷ 40。

| 日付 | 計算 | 上限（分） |
|---|---|---|
| 9/30 | 計画開始日の前 → 通常上限 | 180 |
| 10/01 | u = 0 → 300 | 300 |
| 10/02 | u = 0.025 → 299.85 | 300 |
| 10/10 | u = 0.225 → 300 − 240×0.050625 = 287.85 | 288 |
| 10/11 | u = 0.25 → 300 − 240×0.0625 = 285 | 285 |
| 10/19 | u = 0.45 → 300 − 240×0.2025 = 251.4 | 251 |
| 10/20〜10/22 | テスト1 の間は Q₁ = B(10/20)（u = 0.475）= 245.85 を維持 | 246 |
| 10/23 | 回復: u_end = u(10/22) = 0.525 → r = 0.8×(1 − 0.275625) = 0.5795。R₁ = 245.85 + 0.5795×(300 − 245.85) = 277.23 | 277 |
| 10/24 | 10/23 から 11/10（Q₂ = G = 60）まで 18 日で直線（1日 −12.068）→ 265.16 | 265 |
| 10/31 | 180.68 | 181 |
| 11/01 | 168.62 | 169 |
| 11/09 | 72.07 | 72 |
| 11/10〜12/19 | 最後のテストが始まったら G、終わった後も G | 60 |
| 12/20〜2027-01-07 | 空白期間 | 制限なし |
| 2027-01-08 | 空白期間が終わったので元の上限 | 60 |

連続テストの例（同じテストの中）: テストが 10/20〜10/22 と 10/23〜10/24（続けて）、最後が 11/10 のとき、10/22 は 246、10/23・10/24 は回復せず Q₂' = B(10/23)（u = 0.55）= 227.4 → **227**、10/25 は回復して R = 227.4 + 0.5355×(300 − 227.4) = 266.28 → **266**（P はまだ S のまま）。

今日から先だけ計算し直す例（Q4）: 上の設定で 10/25 に新しい最後のテスト（11/20〜11/21）を足すと、10/24 までは上の表のまま、10/25 は新しい D = 50 で計算し直して **272**（前の計算なら 253）。

同じテストのファイルで、「テストが0件なら計画があっても通常上限」「通常上限 0 分は 0 分の上限として入る（未設定ではない）」「重なるテスト・D = 0 で S ≠ G は 400 で前の版を保つ」も確かめています。

## 5. サーバのデータの置き場（MOCK の store）

`src/server/mock/store.ts` の `MemoryStore` が、すべてのデータを**メモリの上**に持ちます。サーバのプロセスに1つだけ（`getStore()`）。サーバを止めると消えます。DB に移すときは、このクラスと同じ関数の形で作り直す想定です。

| 持っているもの | 中身 | D の番号 |
|---|---|---|
| `users` | userId → 名前・役割（`null` あり） | D1 |
| `googleUsers` | Google の利用者 ID（sub）→ userId | D1 |
| `sessions` | 合言葉 → userId・最後に使った時刻（30日使わなければ無効） | — |
| `pairs` | pairId → code・子ども・保護者・状態・期限 | （QR の一時的な番号） |
| `links` | `"<親の id>\|<子の id>"` の集まり | D2 |
| `configs` | 子どもごとの設定: 版・計算の版・通常上限・計画・テスト期間・空白期間・日別上限・対象外アプリ・外した対象外アプリ（`removedExcludedApps`）・対象外アプリの一覧が最後に変わった版（`excludedAppsChangedVersion`）・子どもが使っている版 | D3・D6・D7・D8 |
| `batches` | 送信 ID → 子ども・中身の指紋・採用した日 | （C8 の重複防止） |
| `usage` | 子ども → 日付 → その日の正の記録 | D4 |
| `lastUploadedAt` | 子ども → 最後に記録が届いた時刻 | — |

### `MOCK=1` のときに入る見本（`seedDemo`）

| 人 | idToken（ログインのボタン） | 合言葉 | userId | 役割 |
|---|---|---|---|---|
| デモの保護者 | `mock-google-parent` | `mock-token-parent` | `demo-parent` | parent |
| デモの子ども | `mock-google-child` | `mock-token-child` | `demo-child` | child |
| はじめての人 | `mock-google-new` | `mock-token-new` | `demo-new` | なし |

- デモの保護者と子どもは、はじめから連携済み。
- デモの子どもの設定: 通常上限 180 分、計画（開始日 = 14日前・S = 300・G = 120。見本だけ過去の開始日を許している）、テスト「数学」（今日の 11日後〜13日後）、対象外アプリ「学習ノート」、過去14日ぶんの日別上限、過去6日ぶんの利用記録（`contracts/fixtures.ts` の `demoAppMinutes`）。
- 手元の開発サーバ（`getStore`）では、デモの子どもの設定の版を**サーバの起動時刻（ミリ秒）から**数える（`startupVersionBase`。`StoreOptions.versionBase`）。MOCK のサーバを再起動しても版が前より大きくなるので、子どもの端末は古い版の手元の設定を捨てて新しい設定を取り込める。はじめての人は再起動で別の ID になるので 0 から数える。テストで `resetStore` したときは 0 から。
- アプリの MOCK のログインの「はじめての人（この端末: xxxx）」は `mock-new-<端末の番号>` を送るので、端末ごとに別の「はじめての人」が作られる（2台で QR の紐づけを試すため）。`mock-` で始まり上の3つでないものは、みな新しい人になる。

### 端末に残すもの

`src/lib/storage.ts` の `storageKeys`。一覧は [architecture.md の 5章](architecture.md#5-端末に残すもの)。

### 端末に残すもの（Kotlin。C4・C5）

Kotlin の監視とウィジェットは JS が動いていなくても読むので、AsyncStorage ではなく SharedPreferences に置く。形の正本は `modules/kit-native/android/src/main/java/dev/hackathon/kit/kitnative/engine/EngineStore.kt` の先頭のコメント。

| ファイル / キー | 中身 | 書く | 読む |
|---|---|---|---|
| `slope_engine` / `restriction` | JSON。`saveRestriction` で受け取った判定の値（`date`・`limit`・`upcoming`・`excludedPackages`・`essentialPackages`・`learningPackages`・`configVersion`・`savedAt`） | `saveRestriction` | 監視・`getEngineStatus`・再起動後 |
| `slope_engine` / `today_usage` | JSON。今日のまとめ `{date, status, restrictedMinutes, limit, usedPercent, reached, measuredAt}`。`usedPercent` は C3 と同じ規則、出せない状態は `null` | 監視（30 秒ごと）・`getDailyUsage`（今日の分） | ウィジェット（`EngineStore.loadToday`） |
| `slope_engine` / `engine_enabled` | Boolean。監視を続けるか | `startEngine`・`stopEngine`・`clearLocalData` | 再起動後・監視 |
| `slope.widget`（K-B） | テストの日程 | `saveRestriction` の `testPeriods` → `WidgetStore.saveTests` | ウィジェット |

`today_usage` が変わったら、自分のアプリにだけ放送 `dev.hackathon.kit.kitnative.TODAY_UPDATED` を送る（ウィジェットが描き直す）。ログアウト（`clearLocalData`）で全部消す。

## 6. `backend/` の DB の表との対応

`backend/src/db/schema/` は試験用の DB の表の設計です（今のサーバはつないでいない）。名前と項目は契約にそろえていますが、**そのままでは今の仕様を入れられない所があります**。

| 契約・store | DB の表 | 合っている所 | 違う所（DB につなぐときに要る対応） |
|---|---|---|---|
| 利用者 `Session`・`users` | `users`（`id`・`role`・`display_name`） | 役割は parent／child | DB は `role` が必須。紐づけ前の `role: null` を入れられない。Google の利用者 ID・合言葉の表がない |
| QR の `pairs` | なし | — | QR の一時的な番号の表がない（MVP_SPEC 6章も「別途確定」） |
| `links` | `family_links`（`parent_id`・`child_id`） | 親子のつながり | 親1人↔子1人（Q2）は DB では縛らない。サーバの処理で断る |
| `configVersion` | `child_config_versions`（`version`。既定 1） | 子ども1人に版1本（Q6） | store は 0 から始まる（デモの子どもだけ起動時刻から） |
| 計画・通常上限 | `plan_settings`（`plan_start_date`・`start_limit_minutes`・`final_goal_minutes`・`usual_limit_minutes`） | S・G・開始日 | DB は通常上限が必須で、計画と同じ行。store は「計画なしで通常上限だけ」「通常上限が未設定」を持てる |
| `calculationVersion` | `plan_calculation_versions` | 計算の版 | — |
| 日別上限 `DailyLimit` | `daily_limits`（`limit_date`・`limit_minutes`・`calculation_version`） | 1日1行・0 分も有効 | `limit_minutes` は必須の整数なので、空白期間の**「制限なし」を表せない**。空白期間の表もない |
| テスト期間 `TestPeriod` | `test_periods`（`name`・`start_date`・`end_date`・`created_by_user_id`） | 名前・期間・作った人 | `createdByRole` の列がない。重なりを禁じる決まりはない（サーバで断る） |
| 空白期間 `BlankPeriod` | なし | — | 表がない |
| 対象外アプリ `ExcludedApp`・`RemovedExcludedApp` | `excluded_apps`（`app_id`・`enabled`） | アプリの識別子 | `label`・`sinceVersion`・`removedVersion` の列と、一覧が最後に変わった版（`appsChangedVersion`）がない |
| 送信 ID `batches` | `usage_sync_batches`（`submission_id`・`payload_hash`） | 送信 ID と中身の指紋で重複を防ぐ | — |
| 利用記録 `UsageDayReport` | `usage_records`（`usage_date`・`app_id`・`used_minutes`） | 日付・アプリ・分数 | 測った時刻・制限対象の合計・`label`・`excluded` がない。「日ごとに一番新しい測定が正」の決まりを表に持てない |

`backend/README.md` の「Deferred decisions」にも、Google の利用者の対応づけ・QR の番号の置き場・親子の人数・C10 の日付の確定・終了日を含むか、が未決として挙がっています。

### `src/server/db/` について

`src/server/db/`（Neon / PGlite への接続と、例の表 `rules`・`usage`）は、アプリのひな型から残っているものです。`drizzle.config.ts` と `npm run db:push` はこれを使いますが、**今の API は使っていません**（`tests/server/db.test.ts` が接続を確かめるだけ）。DB につなぐときに、`backend/` の表の設計と合わせて決め直します。

DB につなぐときにやることは、[open-questions.md](open-questions.md) の「4. 次の段階（DB につなぐ）でやること」にまとめてあります。
