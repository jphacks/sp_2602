# まだ決まっていないこと

仕様がまだ決まっていない所と、資料どうしが食い違っている所のうち、実装に関わるものを並べます。
どの項目も「**今の仮の動き**」と「**どこを直せば変えられるか**」を書きました。決まったら [decisions.md](decisions.md) に1行足し、ここから消してください。

- 決まったこと（Q1〜Q15）は [decisions.md](decisions.md)。
- コードの中では、仮の値の所に `TODO(未決):`、人間が保留にした所に `TODO(保留):` を付けています。`TODO(未決)` で検索すると全部見つかります。

## 1. 後で決める質問（Q16〜Q23）

### Q16. C10 の計算の細かい決まり

C10 の未決の点は、`src/server/plan/daily-limits.ts` の `DailyLimitOptions`（計算の引数）で切り替えられるように作ってあります。既定値を変えるか、`backend/src/db/c10-recalculate.ts` の `recalculateC10InTransaction` から `computeDailyLimits` に引数を渡すと、計算全体が変わります（今は引数を渡さず既定値で計算している）。

| # | 決まっていないこと | 今の仮の動き | どこを直せば変えられるか |
|---|---|---|---|
| 1 | 最初のテストより前の日を、基準曲線 B(d) に沿わせるか、S → Q₁ の直線にするか | B(d) に沿わせる（`firstSegment: "curve"`） | `DailyLimitOptions.firstSegment` を `"linear"` に |
| 2 | 「有効なテスト」の条件（終わったテストを含めるか） | 開始日が計画開始日以降のテストはすべて使う（終わったものも含む）。計画開始日より前に始まるテストは無視 | `daily-limits.ts` の `selectPeriods` |
| 3 | テストの重なり・同じ日のテスト | **決まった（D-93）**: 開始日と終了日がまったく同じテストは1件にまとめ、それ以外の重なりは計算できない入力として断る（`bad_request`）。画面は同じ日程も含めて送る前に止める | サーバ: `daily-limits.ts` の `normalizeTestPeriods`・`sortedNoOverlap`。画面: `src/components/schedule/logic.ts` の重なりの検査 |
| 4 | D = 0（計画開始日に最後のテストが始まる） | **決まった（D-92）**: S と G に関係なく、最後のテストの間は G、終わった翌日から通常上限 | `daily-limits.ts` の `buildRawLimit` |
| 5 | 分にするときの丸め方 | **決まった（D-92）**: 切り捨て（`rounding: "floor"`） | `DailyLimitOptions.rounding`（`"round"`・`"ceil"` も選べる） |
| 6 | 1日に下げてよい最大の幅 | 制限しない（`maxDailyDecrease: null`） | `DailyLimitOptions.maxDailyDecrease`・`previousDayLimit` |
| 7 | 何日先まで計算して保存するか | 保存した日から 120 日先まで。残りが 60 日を切ったら `configGet` のときに作り足す（D-54） | `src/server/plan/daily-limits.ts` の `LIMIT_HORIZON_DAYS`・`LIMIT_TOPUP_MIN_DAYS`、`backend/src/db/c10-recalculate.ts` の `topUpDailyLimits` |
| 8 | 計画開始日より前の日の上限 | 通常上限（`beforePlanStart: "usual"`） | `DailyLimitOptions.beforePlanStart` を `"start"`（S）に |
| 9 | 連続テストで回復しなかったとき、次の回復で使うピーク P | 前のピークのまま（`consecutivePeak: "keep"`） | `DailyLimitOptions.consecutivePeak` を `"test"` に |
| 10 | 空白期間どうしが重なるとき | **決まった（D-94）**: 計算できない入力として断る | `daily-limits.ts` の `computeDailyLimits`（`sortedNoOverlap`） |
| 11 | テスト期間・空白期間の終了日をその日に含むか（`backend/README.md` の Deferred decisions） | 含む | `contracts/schemas.ts` の `periodFields` のコメント、`daily-limits.ts` の期間の比較（`<=`） |

### Q17. 上限に「到達した」の判定（C3）

- 今の仮の動き: 「使った分 ≥ 上限」で到達（上限 0 分は必ず到達）。
- 変える場所: `src/lib/usage-calc.ts` の `CalcInput.reachedWhen`（`"gt"` にすると「上限を超えたら」）。呼ぶ側で渡していないので、既定値を変えるのが早い。

### Q18. ウィジェット（C5）の割合の向き

- 今の仮の動き: ウィジェットは作っていない（MVP の後）。C3 は使用済み％（`displayUsedPercent`）と残り％（`remainingPercent`）の両方を出しているので、どちらになっても計算は変わらない。
- 変える場所: ウィジェットを作るとき、`src/lib/usage-calc.ts` の `UsageCalc` から使う方を選ぶ。

### Q19. 親03 振り返りの「減った」は何と比べるか

- 今の仮の動き: 「計画の初日の上限」と「今日の上限」を比べる（上限の減り）。Figma 親03 の数字（40 分・13%）がこの読み方で合うため。作る前の質問の一覧のおすすめ（先週と今週の**使った時間**を比べる）とは違う。
- 変える場所: `src/components/parent/review.ts` の `limitReduction`（この関数だけを差し替える）と、表示の `src/app/parent/review.tsx` の `ReductionCard`。

### Q20. 子どもの端末のログアウト

- 今の仮の動き: 子07 にログアウトがある（確認のダイアログつき。`src/components/LogoutListItem.tsx`）。ログアウトで、まず合言葉をサーバでも無効にし（`authSignOut`。D-90）、合言葉・設定のキャッシュ全部・その子どもの送信待ちを消す（`src/lib/sign-out.ts`）。**まだ送っていない利用記録は、ログアウトすると失われる**。監視（Kotlin）はまだないので、ログアウトで監視が止まるかは決めていない。
- 変える場所: 子どもの画面から外すなら `src/app/child/settings.tsx`。ログアウトで消すものは `src/lib/sign-out.ts` の `clearLocalDataFor`（合言葉は `src/lib/storage.ts` の `clearSessionData`）。

### Q21. 安全上の「必須例外」アプリの一覧（C3・C4）

- 今の仮の動き: 電話（`com.android.phone`・各社のダイヤラー）・緊急通報（`com.android.emergency`）・連絡先・このアプリ自身（`com.quedotcom.androidslope`。`app.json` の `android.package` と同じ）。作る前の質問の一覧のおすすめにあった SMS・設定・ホーム画面（ランチャー）は入っていない。
- 変える場所: `src/lib/usage-calc.ts` の `ESSENTIAL_PACKAGES`（C3 と C4 の両方がこの一覧を使う）。

### Q22. 「古い可能性あり」と出すまでの時間・再送の間隔

- 今の仮の動き:
  - C7: 時間で決めていない。取りに行って失敗した時点で「最新でない可能性があります」（`stale`）。
  - C8: 失敗のたびに 30 秒 → 60 秒 → … と倍にして最大 15 分あけて送り直す。回数の上限なし。直らない失敗は隔離して送り直さない。
- 変える場所: C7 は `src/lib/config-cache.ts`（`stale` の理由）と `src/components/child/child-view.ts` の `staleNotice`。C8 は `src/lib/usage-outbox.ts` の `backoffMs`。

### Q23. 子02 の「ちょうどいいペース！」の判定

- 今の仮の動き: 使った割合だけで決める。0〜60%「ちょうどいいペース！」、61〜99%「ゆっくり使おう」、到達「今日はここまで。また明日！」。割合を出せないときは札を出さない。
- 変える場所: `src/components/child/child-view.ts` の `paceView`・`PACE_GOOD_MAX_PERCENT`。

## 2. コードの中の `TODO(未決)` と `TODO(保留)`

2026-10-17（commit `fab490f`）の時点で `TODO(未決)` と `TODO(保留)` を検索して見つけたものすべてです（テストのファイルの名前に出てくるものは、下の項目と同じ内容なので省きました）。上の Q16〜Q23 と重なるものは「→ Q◯」と書きました。

### 保留（人間が保留にしたもの）

| 場所 | 決まっていないこと | 今の仮の動き | 変えるときに直す所 |
|---|---|---|---|

### サーバ

| 場所 | 決まっていないこと | 今の仮の動き | 変えるときに直す所 |
|---|---|---|---|
| `src/server/plan/daily-limits.ts` の `DailyLimitOptions`・`selectPeriods`・`buildRawLimit`・`computeDailyLimits` | C10 の細かい決まり | → Q16 | → Q16 |
| `src/server/plan/daily-limits.ts` の `LIMIT_HORIZON_DAYS` | 日別上限を何日先まで作るか | 保存した日から 120 日（残り 60 日で作り足す） | → Q16-7 |
| `src/server/services/plan-settings.ts` の `savePlanForCaller`・`src/components/parent/plan-form.ts` の `planFormFromView` | 始まった計画の S・G だけを変えたいとき | 開始日は今日以降でないと保存できないので、親02 は開始日の初期値を今日にする（＝今日から計画を作り直すことになる） | `savePlanForCaller` の開始日の確認と `planFormFromView` |
| `src/server/auth.ts` の `unlinkChild` | 外した子どもの設定・利用記録を消すか | 残す（同じ保護者と紐づけ直したときに続きから使えるように）。別の保護者と紐づけ直すと、その保護者に前の利用記録・端末のアプリ一覧とアイコン（Q15）が見える | 消すなら `unlinkChild` のトランザクションで、設定・期間・日別上限・対象外アプリ・利用記録・アプリ一覧（`child_app_lists`。中身とアイコンは一緒に消える）の表からもその子どもの行を消す |
| `contracts/schemas.ts` の `periodFields` | 期間の終了日を含むか | 含む | → Q16-11 |

### 端末の仕組み（`src/lib/`）

| 場所 | 決まっていないこと | 今の仮の動き | 変えるときに直す所 |
|---|---|---|---|
| `src/lib/usage-calc.ts` の `ESSENTIAL_PACKAGES` | 必須例外の一覧 | → Q21 | → Q21 |
| `src/lib/usage-calc.ts` の `CalcInput.reachedWhen` | 到達の判定に等号を含むか | → Q17 | → Q17 |
| `src/lib/usage-outbox.ts` の `backoffMs` | 送り直しの間隔と回数 | → Q22 | → Q22 |
| `src/lib/config-cache.ts` の `StaleReason` | 古い版の応答を捨てたとき（手元のほうが新しい）にも「最新でない可能性あり」と出すか | 出す（FigJam の図どおり。理由 `older_response`） | `config-cache.ts` の `refresh`（`discard` のとき `fresh` で返す）か、`child-view.ts` の `staleNotice` で `older_response` を除く |
| `src/lib/polling.ts`（先頭） | 画面が出ていないときの予備の取得（15分ごと） | 作っていない。画面が前に出ている間だけ取る | Kotlin（WorkManager など）側で作る |
| `src/lib/usage-calc.ts` の `LEARNING_PACKAGES` | C4 で誘導する学習用アプリ（Kotlin に渡す一覧と、子11 の「お勧めアプリ」で上から順に開く一覧は同じもの） | Google Classroom・Duolingo | `LEARNING_PACKAGES` |
| `src/lib/child-data.tsx` の `refresh` | 対象外アプリの設定がまだ取れていない（組がない）ときの利用記録 | すべてのアプリを制限の対象として送る（必須例外は除く） | `refresh` の `excluded` の作り方 |

### 画面

| 場所 | 決まっていないこと | 今の仮の動き | 変えるときに直す所 |
|---|---|---|---|
| `src/app/pair/parent.tsx` の `waitingChild` の表示 | Figma にない「子どもの返事を待っています」の見た目 | QR・連携の画面と同じ形（`MessageView`） | `pair/parent.tsx` |
| `src/app/pair/parent.tsx` の親15 のボタン | Figma は「使用状況を見る」（親01 へ） | 「1日の上限を決める」→ 通常上限の画面（Q7） | `pair/parent.tsx` の `linked` の `actions` |
| `src/components/pair/parent-flow.ts` の `CODE_PATTERN` | QR の番号の形（契約は1文字以上としか決めていない） | 英数字と `-` `_` の 8〜128 文字 | `CODE_PATTERN`（サーバの番号の作り方 `src/server/auth.ts` の `randomCode`（16進40文字。D-5）とそろえる） |
| `src/components/child/child-view.ts` の `paceView` | ペースの札の判定 | → Q23 | → Q23 |
| `src/components/child/child-view.ts` の `dayCalc` | 子02 の過去の日を、どの対象外アプリの設定で数えるか | 今の設定で数える（端末はその日の設定を残していない）。親の画面はサーバに送った合計を使うので、親子で値がずれることがある | `dayCalc`（端末にその日の対象外の設定を残すなら `child-data.tsx` も） |
| `src/components/parent/review.ts` の `limitReduction`・`src/app/parent/review.tsx` | 「減った」の基準 | → Q19 | → Q19 |
| `src/components/parent/charts.ts` の `reviewWeekBars` | 親03 の棒の上の数字の意味 | 計画の前の週は使った時間の平均、計画の中の週は上限の平均（Figma どおり） | `reviewWeekBars` |
| `src/components/schedule/logic.ts`（重なりの検査） | 重なる期間の扱い | 断る（サーバと同じ） | → Q16-3 |

## 3. 資料どうしの食い違いのうち実装に関わるもの

| # | 食い違い | 今の扱い | 変えるときに直す所 |
|---|---|---|---|
| 1 | 紐づけの段階: FigJam は「親が読んだら即 D2 に保存」の2段階、作り直し前の設計と Figma 子18 は「子どもが『はい』で確定」の3段階 | 3段階（plan.md で作り直し前の設計を使うと決まっている） | `src/server/auth.ts` の `claimPair`・`confirmPair`、`child-flow.ts`・`parent-flow.ts` |
| 2 | C7 の古い応答: FigJam は「古い応答を捨てて『古い可能性あり』と出す」。作る前の質問の一覧のおすすめは「手元を最新のまま使う」 | FigJam どおり出す（上の `config-cache.ts` の項目） | `config-cache.ts`・`child-view.ts` の `staleNotice` |
| 3 | C6 の図では、親の画面でも C2（端末の使用時間）を呼ぶように見える | 親の画面は C2 を呼ばない。サーバに届いた記録だけを使う（MVP_SPEC 5.2「親端末の UsageStats を子どもの実績として使わない」） | — |
| 4 | C4 の判定の書き方が図によって違う | 判定の順は「必須例外 → 対象外アプリ → 上限到達」（`usage-calc.ts` の `isExcluded` → `calcUsage`）。制限画面の名前は Figma 子11「利用時間が終わった画面」 | Kotlin を作るときにそろえる |
| 5 | C8 の部分成功（「成功分だけ送信待ちを解除」）が図では1件分の流れ | サーバは日ごとに採用・不採用を決め、採用した日を `appliedDates` で返す。端末は `accepted`／`duplicate` なら1回分をまとめて消す | `backend/src/db/usage-persistence.ts` の `persistUsageSubmission`・`usage-outbox.ts` の `flushOnce` |
| 6 | 親01・子01 の「詳しく見る」の行き先が図にない。作る前の質問の一覧のおすすめは「子01 → 子02、親01 → 親03」 | 子01 → 子02。**親01 → 親09（アプリごとの利用時間）**（おすすめと違う） | `src/app/parent/home.tsx` の `TodayCard` |
| 7 | 子07 設定は下部タブにもあるのに、Figma に戻るボタンがある。作る前の質問の一覧のおすすめは「タブの画面には戻るボタンを出さない（親04 にそろえる）」 | 子07 は Figma どおり戻るボタンを出す（押すとホーム）。親04 は出さない | `src/app/child/settings.tsx` の `onBack` |
| 8 | 親16 に戻るボタンがない（設定から入る画面なのに） | 戻るボタンを出す | `src/app/parent/excluded-apps.tsx` |
| 9 | Figma の日程は日付1つ、子05 は入力欄2つ。仕様は名前・開始日・終了日 | 登録も変更も名前・開始日・終了日の3つ（`PeriodForm`） | `src/components/schedule/PeriodForm.tsx` |
| 10 | MVP_SPEC 5.1 の子07 に「親設定の閲覧専用導線」がある | Q13 で「足さない」と決まったので作っていない | `src/app/child/settings.tsx` |
| 11 | MVP_SPEC 5章の Figma の node id（`148:…`、ファイル「ハッカソン練習向け」）と、画面のコメントの node id（`108:…`、ファイル `UGp5tyARKxFRWzOl6KeKVP`）が違う | 画面は `108:…` の「最新」の画面を見て作った | Figma のファイルを1つに決めたら、画面の先頭のコメントと [screens.md](screens.md) を直す |
| 12 | MVP_SPEC 9章の QR の期限は「例：5分（提案値で未承認）」 | 10分（Q10） | `src/server/auth.ts` の `PAIR_TTL_MS`・`child-flow.ts` の `PAIR_TTL_MS`（2か所をそろえる） |
| 13 | MVP_SPEC 2章ではダークテーマは MVP の後。Figma にはダークの画面がそろっているが、エラー・注意（赤・黄）の色はダークの画面に出てこない | 「黒色」を選べるようにした（D-68）。ダークの `danger`・`warningSoft` などは暗い地で読める近い値（仮） | `contracts/tokens.ts` の `dark` |
| 14 | FigJam（`UGp5tyARKxFRWzOl6KeKVP`）の画面の node id が `108:…` から `112:…` に付け直されている（例: 子01 最新 `112:12771`・ダーク `112:13883`）。画面のコメントは古い `108:…` のまま | コメントは直していない（ダークの係は tokens.ts とテーマの部品だけ新しい id を書いた） | 各画面の先頭のコメント |

解消した食い違い（commit `fab490f`）: Android の識別子は `com.quedotcom.androidslope` に決まった（`app.json`・`ESSENTIAL_PACKAGES`）。`docs/rules/stack.md` を指していたコメントは直った。ログアウトで設定のキャッシュを消すようになった（`src/lib/sign-out.ts`）。`backend/` の DB の表との食い違いは、サーバを DB だけにしたときに片づいた（2026-10-18。下の 4章）。

## 4. DB だけにしたあとで残っていること（2026-10-18）

サーバは DB だけを通るようになりました（D-96）。前の版にあった「メモリの store では Vercel で保存が残らない」「`backend/` の表が今の仕様を入れられない」「合言葉をハッシュで保存する」は片づきました（表の対応は [data.md の 6章](data.md)、合言葉と QR の番号のハッシュは D-103）。残っているのは次のことです。

### Neon に migration を入れる

- コードを Vercel に出す前に、プレビューと本番の DB に `backend/drizzle/0011_auth_rules_and_list_versions.sql` を入れる（それぞれの `DATABASE_URL` で `npm run db:migrate`。[development.md の 8章](development.md#8-vercel-の-dbneonを扱う)）。入れないと、QR の読み取り・期間の一覧・設定の保存が失敗します。

### 外した子どものデータ

- `familyUnlink` で外した子どもの設定・利用記録は残しています（D-101。上の 2章の「サーバ」の表）。消すか残すかを決めます。

## 5. デバッグで残った、判断が要るもの（2026-10-17）

実機のデバッグ（第1回・第2回）で見つけたが、色・Kotlin・作り直しが要るなどで直していないものです。

| # | 何が起きるか | なぜ直していないか（判断が要ること） | 直すときに触る所 |
|---|---|---|---|
| 1 | 黒色のテーマで、進捗バー・今日の棒（`primaryFill` #3B5BDB）が下地（`track` #2F3036）の上で見えにくい。明るさの比は 2.3 で、部品の目安 3 に届かない | Figma のダークの値どおり。`contracts/tokens.ts` の色は画面の係では変えない決まりなので、どの色を変えるか（`track` を明るくする・棒だけ別の青にする）を決める必要がある | `contracts/tokens.ts` の `palettes.dark`（`track` か `primaryFill`）。`tests/lib/theme-contrast.test.ts` の部品の組に「`primaryFill` が `track` の上で見える」を足す（今はコメントで外してある） |
| 2 | Android の画面の下のナビゲーションバー（戻る・ホームのボタンの帯）の色が、アプリのテーマ（白色・黒色）に合わない | JavaScript からは変えられず、Kotlin（`MainActivity` で窓の帯の色・ボタンの明暗を変える）か、ネイティブのライブラリを足して、開発用のアプリ（dev client）を作り直す必要がある。実機の作り直しの手間とどちらを先にするか | Kotlin の `MainActivity`（または `expo-navigation-bar` などを足して `app.json` の plugins）。テーマを変えたときに `src/lib/theme.tsx` から呼ぶ窓口を `contracts/native.ts` に足す |
| 3 | アプリを起動した直後、白い地が一瞬見える（黒色のテーマでも） | 選んだテーマは端末の保存（`slope.theme`）を JavaScript が読んでから決まるので、その前の窓の地（Android のテーマの既定の白）が見える。起動画面（splash）の色・窓の地の色を決めて、作り直す必要がある。黒色を選んだ人にだけ黒にするのは、ネイティブ側でも保存を読む必要がある | `app.json`（`expo-splash-screen` の設定・`android` の窓の地の色）と、作り直し。ネイティブで保存を読むなら Kotlin |
| 4 | サーバが覚える送信 ID の記録（C8 の二重保存を防ぐもの）が、消されずに増え続ける（DB の表 `usage_sync_batches`） | 何日分（何件）覚えておけば送り直しを見分けられるか（端末の送信待ちの最長の期間）を決める必要がある | `backend/src/db/usage-persistence.ts` の `persistUsageSubmission`（古い行を消す）か、表に期限を付けて決まった時刻に消す。送り直しの間隔は Q22（`usage-outbox.ts` の `backoffMs`） |
