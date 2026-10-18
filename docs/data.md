# データの形と計算

アプリとサーバで受け渡すデータの形（`contracts/schemas.ts`）、上限の3つの状態の区別、日付の扱い、上限の計算（C10）、サーバのデータの置き場（DB）と見本、DB の表との対応をまとめます。

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
| `Family` | `children` | 保護者に紐づく子どもの一覧。MVP は1人まで（Q2。形は一覧のまま） |

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
| `ConfigSnapshot` | `childId`・`configVersion`・`calculationVersion`・`usualLimitMinutes`・`plan`・`testPeriods`・`blankPeriods`・`dailyLimits`・`excludedApps`・`blockedSites`・`generatedAt` | 端末が丸ごと採用する1組。中はすべて同じ版のもの。`blockedSites`（制限する Web サイト。D-111）は既定が空（足す前に端末へ保存した組も読めるように） |
| `ConfigQuery` | `childId`・`knownVersion?` | 取得の入力 |
| `ConfigEpoch` | 文字列（サーバは uuid） | サーバの DB ごとに決まる値（D-109）。DB を作り直すと変わり、再起動では変わらない |
| `ConfigResult` | `{ changed: false, configVersion, epoch }` または `{ changed: true, snapshot, epoch }` | 取得の結果。epoch はどちらにも入る |
| `CachedConfig` | `snapshot`・`savedAt`・`epoch?` | 端末に保存する組（`slope.config.<childId>`）。`epoch` は組をくれた DB の値。epoch を足す前に保存した組には `epoch` がなく、「epoch が違う」として次の取得で置き換える |

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

### 制限する Web サイト（D-111）

| 型 | 中身 | 説明 |
|---|---|---|
| `SitePattern` | 文字（`MAX_SITE_PATTERN_LENGTH` = 200 文字まで） | 保存の入力の1つ。`contracts/web-sites.ts` の `normalizeSitePattern` でそろえた形だけ（`"youtube.com"`・`"youtube.com/shorts"`） |
| `BlockedSite` | `pattern`・`sinceVersion` | 保存済みの登録。`sinceVersion` は足した版。読むときは形を確かめ直さない |
| `BlockedSitesView` | `childId`・`sites`・`sitesChangedVersion`・`configVersion`・`childAppliedVersion` | 親子が読む一覧（子どもの画面には今は出していない） |
| `BlockedSitesSave` | `childId`・`expectedVersion`・`sites`（`MAX_BLOCKED_SITES` = 100 件まで。同じものは2回入れられない） | 保存（全件の置き換え） |
| `BlockedSitesSaveResult` | `sites`・`sitesChangedVersion`・`configVersion` | 保存の結果 |

登録の形と一致の規則（`contracts/web-sites.ts`。Kotlin の `engine/WebSites.kt` も同じ規則で、同じ例の表 `modules/kit-native/android/src/test/resources/web-site-cases.tsv` で確かめる）:

- そろえ方: 全角を半角（NFKC）・小文字・前後の空白を外す → `http://`・`https://` を外す（ほかの scheme は断る）→ ドメインの頭の `www.`・末尾の `.` を外す → パスの末尾の `/` を外す。`?`・`#`・`@`・`:`（ポート）・空白・日本語のドメイン・IP アドレス・区切りが1つのもの（`youtube`）は断る。
- 一致: アドレス欄の文字からドメインとパスを取り出し（`user@` の後ろが本当のドメイン・ポートと `?` `#` より後ろは見ない）、ドメインが登録と**同じ**か **`.` ＋登録で終わる**とき。パスつきの登録は、パスが登録と同じか **登録 ＋ `/`** で始まるとき（`/shorts` は `/shorts/abc` に当たり `/shortstory` には当たらない）。アドレスらしくない文字（空白が入る・`chrome://` など）は判定しない。

### 子どもの端末のアプリ一覧とアイコン（Q15・D-110）

| 型 | 中身 | 説明 |
|---|---|---|
| `ChildApp` | `packageName`・`label`・`iconHash?` | 子どもの端末のホーム画面に出るアプリ1つ（送る形）。`iconHash` は PNG の SHA-256（16進 64 文字）。作れなかったアプリは省く |
| `ChildAppsUpload` | `childId`・`apps`（`MAX_CHILD_APPS` = 1000 件まで。同じ packageName は2回入れられない） | 一覧の送信（全件の置き換え） |
| `ChildAppsUploadResult` | `appCount`・`receivedAt`・`iconsNeeded` | `iconsNeeded` はサーバにない・中身が違うアイコンのアプリ |
| `ChildAppIcon` | `packageName`・`iconHash`・`png`（base64。`MAX_APP_ICON_BYTES` = 20KB まで） | アイコン1枚（送る・読むの両方） |
| `ChildAppIconsUpload` / `ChildAppIconsQuery` | `childId`・`icons` / `packageNames`（どちらも `MAX_APP_ICONS_PER_CALL` = 50 個まで） | アイコンを送る / 読む |
| `ChildAppEntry` | `packageName`・`label`・`iconHash`（なければ `null`） | 保護者が読む一覧の1つ |
| `ChildAppsView` | `childId`・`apps`（表示名の順）・`receivedAt`（まだ届いていなければ `null`） | 保護者が読む一覧 |

### 許可の見張りと親への通告（D-113）

| 型 | 中身 | 説明 |
|---|---|---|
| `DevicePermissionKey` | `"usageAccess" \| "overlay" \| "notifications" \| "accessibility"` | 見張る4つの許可の名前（`NativePermission` と同じ。電池の最適化は見張らない） |
| `DevicePermissions` | 4つの許可それぞれの真偽 | 許可ごとのオン/オフ |
| `DeviceStatusReport` | `childId`・`permissions`・`measuredAt` | 子どもの端末の Kotlin が送る形。使用時間・アプリ名・URL は入れない |
| `ChildDeviceStatus` | `permissions`・`offSince`（許可ごとのオフになった時刻。オンなら `null`）・`measuredAt`・`lastSeenAt` | 保護者が読む形。`lastSeenAt` はサーバに最後に届いた時刻（サーバの時計） |
| `DeviceStatusView` | `status`（`ChildDeviceStatus`。まだ届いていなければ `null`） | `deviceStatusGet` の出力 |

### 端末の中だけの型（サーバとは受け渡さない）

| 型 | 場所 | 説明 |
|---|---|---|
| `NativeUsageResult` | `contracts/native.ts` | C2 の結果。`ok`（`apps` が空 = 本当に使っていない）／`permission_denied`／`unavailable` |
| `NativeRestriction` | `contracts/native.ts` | C4 の判定に Kotlin へ渡す値。`limit` は `limited`／`unlimited`／`unset`。`blockedSites`（制限する Web サイトの登録。D-111）も入る |
| `LimitInput` | `src/lib/usage-calc.ts` | C3 に入れる当日の上限。`set`／`unlimited`／`unset`／`unknown` |
| `UsageCalc` | `src/lib/usage-calc.ts` | C3 の結果。`ok`／`unlimited`／`permission_denied`／`usage_unavailable`／`limit_unset`／`limit_unknown`／`limit_invalid` |
| `ConfigState` | `src/lib/config-cache.ts` | 端末が持つ設定。`fresh`／`stale`（理由つき）／`unavailable` |
| `NativeLauncherAppsResult` | `contracts/native.ts` | Q15 のアプリ一覧。`ok`（`apps`: packageName の順。`iconPng`・`iconHash` つき）／`unavailable`（0 個の一覧にしない＝送らない） |

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
|---|---|---|
| 0 分使った | `recorded: true`・`usedMinutes: 0` | `ok` で `apps` の分数が 0・または空 | 0 分・0% |
| 記録が届いていない | `recorded: false`・`usedMinutes: null` | — | 「まだ記録が届いていません」・グラフは「？」 |
| 取れない | — | `unavailable`・`permission_denied` | 取得できなかった旨・権限の案内（0% と出さない） |

テスト期間が0件でも「上限未設定」ではありません。計画があってもテストが0件なら、通常上限を使います（MVP_SPEC 4.3）。

## 3. 日付

- **日本時間（Asia/Tokyo）固定・0時区切り**です（Q3）。「今日」を出すのは `contracts/dates.ts` の `todayString` だけ（日本は夏時間がないので UTC+9 で計算する）。サーバも `todayString(new Date())` を使う（`backend/src/db/c10-recalculate.ts` など）。
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

- テスト期間・空白期間は**開始日と終了日の両方を含む**ものとして計算します。
- 画面の日付の入力（`src/components/DateField.tsx`）も、日本時間の「その日」として受け渡します（正午で受け渡す）。

## 4. C10 日別上限（DB-backed）

DB-backed APIは既存の純粋計算関数を使い、D3/D8/空白期間の入力更新とD6・計算版の保存を1トランザクションで行います。計算に失敗した入力変更はロールバックします。

計算関数は `src/server/plan/daily-limits.ts` の `computeDailyLimits`、保存と再計算は `backend/src/db/c10-recalculate.ts` の `recalculateC10InTransaction`（テスト期間・空白期間・計画・通常上限を保存する `backend/src/db/*.ts` の処理が、同じトランザクションの中で呼ぶ）にあります。

### 入力

- 通常上限（`null` = 未設定）
- 計画: 計画開始日 d0・開始上限 S・最終目標 G（`null` = まだない）
- テスト期間の一覧・空白期間の一覧

### 式（MVP_SPEC 4.4）

- 基準曲線: **B(d) = S − (S − G)·u²**、u = clamp((d − d0) ÷ D, 0, 1)。D = d0 から**最後のテストの開始日**までの日数。
- テスト i の開始日の目標 Qᵢ = B(開始日)。最後のテストだけは Q = G。**テスト期間中は Qᵢ を維持**する。
- 最終テスト期間（開始・終了日を含む）は G。終了日の翌日から親の通常上限へ戻す（通常上限が G 以下の場合もそのまま適用）。
- 最後ではないテストの終了後（回復）:
  - rᵢ = clamp(0.8 × (1 − u_end²), 0, 0.8)（u_end はテスト終了日の u）
  - Rᵢ = Qᵢ + rᵢ × (Pᵢ − Qᵢ)（Pᵢ は前の回復のピーク。最初は P = S）
  - 終了の翌日を Rᵢ とし、次のテストの開始日の目標まで**実際の日数で直線**に下げる。次の回の P は Rᵢ。
- テスト期間が連続する場合は回復しない。金曜と月曜のテストのように週末だけを挟む場合も連続として扱い、間の日は直前テストの上限を維持する。
- 同一のテスト日程は1つの論理期間にまとめる。矛盾する重複期間は入力エラーにする。
- 途中は丸めず、日別上限の確定時に分単位で切り捨てる。0〜1440 に収める。

### 決まり（仮のものを含む）

| 場合 | 今の動き |
|---|---|
| 計画がない | すべての日が通常上限（通常上限も未設定なら、すべて「上限未設定」） |
| 計画はあるがテストが0件 | すべての日が通常上限 |
| 計画開始日より前の日 | 通常上限（仮。引数 `beforePlanStart` で S にもできる） |
| 最初のテストより前の日 | 基準曲線 B(d) のまま（仮。引数 `firstSegment` で S → Q₁ の直線にもできる） |
| 計画開始日より前に始まるテスト | 計算対象から除外。最終テスト開始が計画開始日より前（D < 0）はエラー |
| 矛盾するテスト期間・空白期間の重複 | 計算できない入力（保存は `bad_request`。前の版を保つ） |
| D = 0（計画開始日に最終テスト開始） | S/G に関わらず最終テスト期間中は G。終了翌日は通常上限 |
| 空白期間の日 | 上の計算に関係なく「制限なし」。終わった日から元の上限に戻る |
| 日別上限を何日先まで作るか | 現行の既定は今日から120日先（`LIMIT_HORIZON_DAYS`）。設定を保存したときに作り、残りが60日を切ったら `configGet` のときに作り足す（`topUpDailyLimits`）。期間は仕様として未決 |
| 再計算の開始日 | 当日の確定値を保持し、翌日から再計算。初回で当日値が未作成なら当日分を補完 |

残る未決事項は日別上限の生成期間です。詳しくは [open-questions.md](open-questions.md) を参照してください。

### 手計算の例

`tests/verify/c10-hand.test.ts` の例です。計画開始日 d0 = 2026-10-01、S = 300、G = 60、通常上限 180。
テスト1 = 10/20〜10/22（途中）、テスト2 = 11/10〜11/12（最後）、空白期間 = 12/20〜2027-01-07。
D = 10/01 から 11/10 まで = 40 日。B(d) = 300 − 240·u²、u = (d − 10/01) ÷ 40。

| 日付 | 計算 | 上限（分） |
|---|---|---|
| 9/30 | 計画開始日の前 → 通常上限 | 180 |
| 10/01 | u = 0 → 300 | 300 |
| 10/02 | u = 0.025 → 299.85 | 299 |
| 10/10 | u = 0.225 → 300 − 240×0.050625 = 287.85 | 287 |
| 10/11 | u = 0.25 → 300 − 240×0.0625 = 285 | 285 |
| 10/19 | u = 0.45 → 300 − 240×0.2025 = 251.4 | 251 |
| 10/20〜10/22 | テスト1 の間は Q₁ = B(10/20)（u = 0.475）= 245.85 を維持 | 245 |
| 10/23 | 回復: u_end = u(10/22) = 0.525 → r = 0.8×(1 − 0.275625) = 0.5795。R₁ = 245.85 + 0.5795×(300 − 245.85) = 277.23 | 277 |
| 10/24 | 10/23 から 11/10（Q₂ = G = 60）まで 18 日で直線（1日 −12.068）→ 265.16 | 265 |
| 10/31 | 180.68 | 180 |
| 11/01 | 168.62 | 168 |
| 11/09 | 72.07 | 72 |
| 11/10〜11/12 | 最終テスト期間 | 60 |
| 11/13〜12/19 | 最終テスト終了翌日から通常上限 | 180 |
| 12/20〜2027-01-07 | 空白期間 | 制限なし |
| 2027-01-08 | 空白期間が終わったので通常上限 | 180 |

連続テストの例（同じテストの中）: テストが 10/20〜10/22 と 10/23〜10/24（続けて）、最後が 11/10 のとき、10/22 は 245、10/23・10/24 は回復せず Q₂' = B(10/23)（u = 0.55）= 227.4 → **227**、10/25 は回復して R = 227.4 + 0.5355×(300 − 227.4) = 266.28 → **266**（P はまだ S のまま）。

上の例は C10 の計算の手計算のテストデータです（`tests/verify/c10-hand.test.ts`。サーバの API を通して DB に保存した結果と比べる）。

同じテストのファイルで、「テストが0件なら計画があっても通常上限」「通常上限 0 分は 0 分の上限として入る（未設定ではない）」「矛盾する重複テストは入力エラーで前の版を保つ」「D=0でGを適用」も確かめています。

## 5. サーバのデータの置き場（DB）と見本

サーバはデータをメモリに持ちません。すべての API が DB だけを通ります（Vercel では Neon、手元とテストでは PGlite。`src/server/db/index.ts`）。処理は `src/server/auth.ts`（ログイン・合言葉・QR・家族）と `src/server/services/`（計画・日程・対象外アプリ・設定の組）にあり、保存は `backend/src/db/*.ts` の Drizzle の処理を呼びます。表の一覧は 6章です。

`MOCK=1` は処理を変えません。変わるのは次の2つだけです（`src/server/env.ts` の `isMock`。Vercel の本番 `VERCEL_ENV=production` では無視する）。

- `mock-` で始まる idToken のログインを受け付ける（`src/server/auth.ts` の `signInMock`）。
- 手元の DB（PGlite。`DATABASE_URL` が空のとき）を開いたときに、下の見本を DB に1回だけ入れる（`src/server/seed/demo.ts` の `seedMockAccounts`。もう入っていれば何もしない）。`DATABASE_URL` の DB（Neon）には自動では入れない（`src/server/db/index.ts` の `seedsMockOnOpen`。D-126）。

`MOCK=1` でないサーバは、MOCK のログイン（`auth_identities.provider = 'mock'`）の人の合言葉を受け付けない（401。`src/server/auth.ts` の `findSession`。D-126）。DB に見本の人が残っていても、固定の合言葉では入れない。

### `MOCK=1` のときに入る見本（`seedMockAccounts`・`seedDemoFamily`）

| 人 | idToken（ログインのボタン） | 合言葉 | userId（`contracts/fixtures.ts` の `demoUserIds`） | 役割 |
|---|---|---|---|---|
| デモの保護者 | `mock-google-parent` | `mock-token-parent` | `00000000-0000-4000-8000-0000000000a1` | parent |
| デモの子ども | `mock-google-child` | `mock-token-child` | `00000000-0000-4000-8000-0000000000a2` | child |
| はじめての人 | `mock-google-new` | `mock-token-new` | `00000000-0000-4000-8000-0000000000a3` | なし |

- userId は DB の形（uuid）にそろえた固定の値。DB を空にして入れ直しても同じ人になる。
- デモの保護者と子どもは、はじめから連携済み。
- デモの子どもの設定: 通常上限 180 分、計画（開始日 = 14日前・S = 300・G = 120。見本だけ過去の開始日を許している）、テスト「数学」（今日の 11日後〜13日後）、対象外アプリ「学習ノート」、過去14日ぶんの日別上限、過去6日ぶんの利用記録（`contracts/fixtures.ts` の `demoUsageDay`・`demoAppMinutes`）。
- デモの子どもの「端末のアプリ一覧」（Q15）: `mockExcludedAppCandidates`（学習ノート・英単語カード・動画アプリ・ゲーム）＋`demoAppMinutes` のアプリ。アイコンはなし（親09・親16 は頭文字の仮のアイコン）。`seedMockAccounts` だけが入れる（`seedDemoFamily` は本番の本物の親子にも使うので、届いていない一覧を見本で埋めないよう入れない。D-110）。
- 同じ見本（デモの人の合言葉は除く）は、本番・プレビューの DB にも `npm run db:seed-demo` で、Google でログインして紐づけた親子に入れられる（`scripts/seed-demo.ts`。[development.md の 8章](development.md#8-vercel-の-dbneonを扱う)）。
- 設定の版は DB に残るので、手元のサーバを立て直しても数え直さない（`state/pglite` を消したときは見本の版から）。版を数え直したときは DB の `epoch` も変わるので、端末は手元の組を捨てて新しい組を取り込む（D-109）。
- アプリの MOCK のログインの「はじめての人（この端末: xxxx）」は `mock-new-<端末の番号>` を送るので、端末ごとに別の「はじめての人」が作られる（2台で QR の紐づけを試すため）。`mock-` で始まり上の3つでないものは、みな新しい人になる。

### 端末に残すもの

`src/lib/storage.ts` の `storageKeys`。一覧は [architecture.md の 5章](architecture.md#5-端末に残すもの)。

### 端末に残すもの（Kotlin。C4・C5）

Kotlin の監視とウィジェットは JS が動いていなくても読むので、AsyncStorage ではなく SharedPreferences に置く。形の正本は `modules/kit-native/android/src/main/java/dev/hackathon/kit/kitnative/engine/EngineStore.kt` の先頭のコメント。

| ファイル / キー | 中身 | 書く | 読む |
|---|---|---|---|
| `slope_engine` / `restriction` | JSON。`saveRestriction` で受け取った判定の値（`date`・`limit`・`upcoming`・`excludedPackages`・`essentialPackages`・`learningPackages`・`blockedSites`・`configVersion`・`savedAt`）。`blockedSites` は Kotlin がもう一度そろえ、そろわないものは捨てる | `saveRestriction` | 監視・`getEngineStatus`・再起動後・Web サイトの制限（`WebGuardService`。D-111） |
| `slope_engine` / `today_usage` | JSON。今日のまとめ `{date, status, restrictedMinutes, limit, usedPercent, reached, measuredAt}`。`usedPercent` は C3 と同じ規則、出せない状態は `null` | 監視（30 秒ごと）・`getDailyUsage`（今日の分） | ウィジェット（`EngineStore.loadToday`）・Web サイトの制限（`reached` が今日の分で true のときだけ止める。D-111） |
| `slope_engine` / `engine_enabled` | Boolean。監視を続けるか | `startEngine`・`stopEngine`・`clearLocalData` | 再起動後・監視 |
| `slope_engine` / `report_url`・`report_token`・`report_child_id` | 許可の状態の送り先（`deviceStatusReport` の完全な URL）・合言葉（子どもの session token）・送る本文の `childId`（D-113） | `setStatusReporter`（子どもとしてログイン・起動したとき） | 監視の許可の見張り（`StatusReporter`）。`clearStatusReporter`・401・`clearLocalData` で消す |
| `slope_engine` / `report_sent`・`report_sent_at`・`report_retry_at` | 最後に届いた許可の状態（`"1101"` の形）と時刻・失敗したあと次に送ってよい時刻 | `StatusReporter` | `StatusReporter`（送るかどうか。`StatusReportRules.shouldSend`） |
| `slope.widget`（K-B） | テストの日程 | `saveRestriction` の `testPeriods` → `WidgetStore.saveTests` | ウィジェット |

`today_usage` が変わったら、自分のアプリにだけ放送 `dev.hackathon.kit.kitnative.TODAY_UPDATED` を送る（ウィジェットが描き直す）。ログアウト（`clearLocalData`）で全部消す。

## 6. `backend/` の DB の表との対応

`backend/src/db/schema/` のDrizzleスキーマと `backend/drizzle/` のmigrationがDB構造の定義です。すべての API が各サービスから Drizzle repository を呼びます（`MOCK=1` でも同じ。違うのは見本が入っているかだけ）。表を変えたら、コードを出す前に Neon に migration を入れます（[development.md の 8章](development.md#8-vercel-の-dbneonを扱う)）。

| データ | DBの表 | 備考 |
|---|---|---|
| ユーザー・Google identity・セッション | `users`, `auth_identities`, `user_sessions` | roleは連携前にnull。合言葉は SHA-256 の hash でだけ保存し（`src/server/auth/digest.ts`）、最後に使ってから30日で無効（使うたびに延長。D-1）。ログアウトで失効（`otherDevices: true` なら同じ人のほかの合言葉も）。子どもを外すと、その子どもの合言葉はすべて失効 |
| 親子関係・QR | `family_links`, `pair_tickets`, `pair_claim_failures` | 親1人↔子1人（Q2）。QRは10分・1回だけ・出し直しで前を無効（Q10）。QRコードそのものではなくhashを保存。番号のまちがい（`pairClaim` の not_found・conflict）を人ごとに `pair_claim_failures` に数え、10分に10回で `rate_limited`。成功したら消す（Vercel のインスタンスはメモリを共有しないので表に数える） |
| DB の epoch（C7） | `server_meta` | 1行だけ（`id` は必ず 1）。`epoch` は uuid で、最初に読んだときに作る（`backend/src/db/server-epoch.ts` の `readServerEpoch`。migration `0012_server_meta_epoch.sql`）。DB を作り直す・PGlite と Neon を切り替えると別の値、再起動では同じ値。`configGet` の応答に入れる（D-109）。手で書き換えない（書き換えると全部の端末が設定を取り直す） |
| 設定版・反映版 | `child_config_versions`, `child_applied_versions` | 全体 `version` とC10入力専用 `c10_input_version` を別管理。`version` は 0 から（0 = まだ一度も保存していない。0 以上の決まりつき）。一覧が最後に変わった版 `test_periods_changed_version`・`blank_periods_changed_version` が API の `periodsChangedVersion`・`blankChangedVersion` になる |
| D3/D8/空白期間 | `test_periods`, `plan_settings`, `child_usual_limits`, `blank_periods` | 日付順序などの構造制約あり。C10入力に矛盾する重複はrepository transaction内で拒否 |
| D6計算履歴 | `plan_calculation_versions`, `daily_limits` | 日付・計算版単位で履歴を保持。新規上限は0〜1440。過去の範囲外値も確定済み履歴として保持し、再計算で値を変えない。入力版と計算版を同一トランザクションで更新 |
| D7 | `excluded_apps`, `excluded_app_states`, `removed_excluded_apps` | label・追加版・削除版・最終変更版を保持 |
| 制限する Web サイト（D-111） | `blocked_sites`, `blocked_site_states` | `blocked_sites` は子どもと登録（`pattern`。そろえた形・200 文字まで）の組に1行、`since_version`（足した版）。外した登録は行を消す。`blocked_site_states` は子ども1人に1行で `sites_changed_version`（一覧が最後に変わった版。行がない = 0）。保存は版の確かめ・版を 1 上げる・入れ替えを1回のトランザクションで（`backend/src/db/blocked-sites.ts`。migration `0014_blocked_sites.sql`）。C7 の組を読むトランザクションでも一緒に読む |
| Q15（子どもの端末のアプリ一覧とアイコン） | `child_app_lists`, `child_app_list_items`, `child_app_icons` | `child_app_lists` は子ども1人に1行の「届いた」印（`received_at`。行がない = まだ届いていない）。`child_app_list_items` は packageName・表示名（全件の置き換え）。`child_app_icons` はアイコンの PNG（base64・20KB まで）と `icon_hash`（中身の SHA-256。サーバが計算し直して確かめた値）。一覧から消えたアプリのアイコンは一覧の置き換えのときに消す。下の2つは `child_app_lists` を消すと一緒に消える。設定の版とは別（migration `0013_child_app_lists.sql`。D-110） |
| 許可の見張り（D-113） | `device_statuses` | 子ども1人に1行（行がない = まだ一度も届いていない）。許可ごとのオン/オフ（`usage_access`・`overlay`・`notifications`・`accessibility`）と、オフになった時刻（`*_off_since`。最初にオフと届いた報告の測った時刻）・`measured_at`（今の状態を測った時刻。これより古い報告では状態を変えない）・`last_seen_at`（最後に届いた時刻・サーバの時計）。連携を外すと消す（`unlinkChild`）。設定の版とは別（`backend/src/db/device-status.ts`。migration `0015_device_statuses.sql`） |
| C8/C6 | `usage_sync_batches`, `usage_day_reports`, `usage_records` | 送信IDで冪等化。日報に測定時刻と制限対象合計、明細にアプリ名・除外状態を保存。送信・日付・アプリの組を重複させない。サーバの時計より先の測定時刻はサーバの時計で保存する（送り直しを見分ける指紋は送られたままの中身で作る。`backend/src/db/usage-persistence.ts`） |

日別上限が複数計算版に残る場合、C6は現行 `c10_input_version` に一致する最新計算版だけを参照します。一致する計算版がなければ上限は未計算として扱います。
### `src/server/db/` について

`src/server/db/` は `backend/src/db/schema` とDrizzle repositoriesをHono APIから呼ぶ接続口です。ローカルはPGlite、本番構成はNeon PostgreSQL URLを使います。C10はD3/D8/空白期間/通常上限の更新と同一transactionで再計算し、日別上限と計算版を保存します。Neon/Vercel上の実環境接続は別途資格情報を設定して確認してください。
