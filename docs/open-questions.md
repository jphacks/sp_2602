# まだ決まっていないこと

仕様がまだ決まっていない所と、資料どうしが食い違っている所のうち、実装に関わるものを並べます。
どの項目も「**今の仮の動き**」と「**どこを直せば変えられるか**」を書きました。決まったら [decisions.md](decisions.md) に1行足し、ここから消してください。

- 決まったこと（Q1〜Q15）は [decisions.md](decisions.md)。
- コードの中では、仮の値の所に `TODO(未決):`、人間が保留にした所に `TODO(保留):` を付けています。`TODO(未決)` で検索すると全部見つかります。

## 1. 後で決める質問（Q16〜Q23）

### Q16. C10 の計算の細かい決まり

C10 の未決の点は、`src/server/plan/daily-limits.ts` の `DailyLimitOptions`（計算の引数）で切り替えられるように作ってあります。既定値を変えるか、`src/server/mock/store.ts` の `MemoryStore` に渡す `calcOptions` を変えると、計算全体が変わります。

| # | 決まっていないこと | 今の仮の動き | どこを直せば変えられるか |
|---|---|---|---|
| 1 | 最初のテストより前の日を、基準曲線 B(d) に沿わせるか、S → Q₁ の直線にするか | B(d) に沿わせる（`firstSegment: "curve"`） | `DailyLimitOptions.firstSegment` を `"linear"` に |
| 2 | 「有効なテスト」の条件（終わったテストを含めるか） | 開始日が計画開始日以降のテストはすべて使う（終わったものも含む）。計画開始日より前に始まるテストは無視 | `daily-limits.ts` の `selectPeriods` |
| 3 | テストの重なり・同じ日のテスト | 計算できない入力として保存を断る（`bad_request`）。画面も送る前に止める | サーバ: `daily-limits.ts` の `sortedNoOverlap`・`store.ts` の `assertNoOverlap`。画面: `src/components/schedule/logic.ts` の重なりの検査 |
| 4 | D = 0（計画開始日に最後のテストが始まる） | S = G ならすべて S、S ≠ G なら計算できない入力（`bad_request`） | `daily-limits.ts` の `buildRawLimit`（`zero_span`） |
| 5 | 分にするときの丸め方 | 四捨五入（`rounding: "round"`） | `DailyLimitOptions.rounding`（`"floor"`・`"ceil"` も選べる） |
| 6 | 1日に下げてよい最大の幅 | 制限しない（`maxDailyDecrease: null`） | `DailyLimitOptions.maxDailyDecrease`・`previousDayLimit` |
| 7 | 何日先まで計算して保存するか | 今日から 120 日先まで | `store.ts` の `LIMIT_HORIZON_DAYS` |
| 8 | 計画開始日より前の日の上限 | 通常上限（`beforePlanStart: "usual"`） | `DailyLimitOptions.beforePlanStart` を `"start"`（S）に |
| 9 | 連続テストで回復しなかったとき、次の回復で使うピーク P | 前のピークのまま（`consecutivePeak: "keep"`） | `DailyLimitOptions.consecutivePeak` を `"test"` に |
| 10 | 空白期間どうしが重なるとき | テスト期間と同じく計算できない入力として断る | `daily-limits.ts` の `computeDailyLimits`（`sortedNoOverlap`） |
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

- 今の仮の動き: 子07 にログアウトがある（確認のダイアログつき。`src/components/LogoutListItem.tsx`）。ログアウトで消えるのは合言葉だけで、送信待ちの記録と設定のキャッシュは残る。監視（Kotlin）はまだないので、ログアウトで監視が止まるかは決めていない。
- 変える場所: 子どもの画面から外すなら `src/app/child/settings.tsx`。ログアウトで消すものは `src/lib/storage.ts` の `clearSessionData`。

### Q21. 安全上の「必須例外」アプリの一覧（C3・C4）

- 今の仮の動き: 電話（`com.android.phone`・各社のダイヤラー）・緊急通報（`com.android.emergency`）・連絡先・このアプリ自身（`dev.hackathon.kit`）。作る前の質問の一覧のおすすめにあった SMS・設定・ホーム画面（ランチャー）は入っていない。
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

2026-10-17（commit `3b588ce`）の時点で `TODO(未決)` と `TODO(保留)` を検索して見つけたものすべてです（テストのファイルの名前に出てくるものは、下の項目と同じ内容なので省きました）。上の Q16〜Q23 と重なるものは「→ Q◯」と書きました。

### 保留（人間が保留にしたもの）

| 場所 | 決まっていないこと | 今の仮の動き | 変えるときに直す所 |
|---|---|---|---|
| `contracts/api.ts`（表の最後）・`contracts/schemas.ts`（`ExcludedAppsView`）・`contracts/native.ts`（先頭）・`contracts/fixtures.ts`（`mockExcludedAppCandidates`）・`src/app/parent/excluded-apps.tsx`・`src/components/parent/excluded.ts` | Q15: 保護者が対象外アプリを選ぶ候補（子どもの端末のアプリ一覧）をどこから得るか | 子どもの端末のアプリ一覧をサーバへ送る API は作らない。親16 は MOCK の固定の候補（学習ノート・英単語カード・動画アプリ・ゲーム）＋保存済みのアプリを並べる | 一覧を送ると決めたら: `contracts/native.ts` に一覧を取る窓口、`contracts/api.ts` に送る・読む API、`excluded-apps.tsx` の候補を差し替え。`tests/server/api.test.ts` の「子どもの端末のアプリ一覧を送る API はない（Q15 保留）」も直す |

### サーバ

| 場所 | 決まっていないこと | 今の仮の動き | 変えるときに直す所 |
|---|---|---|---|
| `src/server/plan/daily-limits.ts` の `DailyLimitOptions`・`selectPeriods`・`buildRawLimit`・`computeDailyLimits` | C10 の細かい決まり | → Q16 | → Q16 |
| `src/server/mock/store.ts` の `LIMIT_HORIZON_DAYS` | 日別上限を何日先まで作るか | 120 日 | → Q16-7 |
| `src/server/mock/store.ts` の `assertNoOverlap` | 期間の重なりの扱い | 断る | → Q16-3 |
| `src/server/mock/store.ts` の `signInGoogle` | 合言葉の保存のしかた | メモリにそのまま持つ。本物の DB ではハッシュで保存する方針（作り直し前） | DB につなぐときに作る |
| `src/server/mock/store.ts` の `planSave`・`src/components/parent/plan-form.ts` の `planFormFromView` | 始まった計画の S・G だけを変えたいとき | 開始日は今日以降でないと保存できないので、親02 は開始日の初期値を今日にする（＝今日から計画を作り直すことになる） | `store.planSave` の開始日の確認と `planFormFromView` |
| `contracts/schemas.ts` の `periodFields` | 期間の終了日を含むか | 含む | → Q16-11 |

### 端末の仕組み（`src/lib/`）

| 場所 | 決まっていないこと | 今の仮の動き | 変えるときに直す所 |
|---|---|---|---|
| `src/lib/usage-calc.ts` の `ESSENTIAL_PACKAGES` | 必須例外の一覧 | → Q21 | → Q21 |
| `src/lib/usage-calc.ts` の `CalcInput.reachedWhen` | 到達の判定に等号を含むか | → Q17 | → Q17 |
| `src/lib/usage-outbox.ts` の `backoffMs` | 送り直しの間隔と回数 | → Q22 | → Q22 |
| `src/lib/config-cache.ts` の `StaleReason` | 古い版の応答を捨てたとき（手元のほうが新しい）にも「最新でない可能性あり」と出すか | 出す（FigJam の図どおり。理由 `older_response`） | `config-cache.ts` の `refresh`（`discard` のとき `fresh` で返す）か、`child-view.ts` の `staleNotice` で `older_response` を除く |
| `src/lib/polling.ts`（先頭） | 画面が出ていないときの予備の取得（15分ごと） | 作っていない。画面が前に出ている間だけ取る | Kotlin（WorkManager など）側で作る |
| `src/lib/child-data.tsx` の `LEARNING_PACKAGES` | C4 で誘導する学習用アプリ（Kotlin に渡す一覧） | 空 | `LEARNING_PACKAGES`（`child-view.ts` の `RECOMMENDED_APP_PACKAGES` とそろえたい） |
| `src/lib/child-data.tsx` の `refresh` | 対象外アプリの設定がまだ取れていない（組がない）ときの利用記録 | すべてのアプリを制限の対象として送る（必須例外は除く） | `refresh` の `excluded` の作り方 |

### 画面

| 場所 | 決まっていないこと | 今の仮の動き | 変えるときに直す所 |
|---|---|---|---|
| `src/app/pair/child.tsx` の `cancel` | QR を取り消すか | 取り消す API がない。「やめる」は役割選びに戻るだけで、出した QR は期限（10分）まで残る（子どもが「はい」を押さない限りつながらない） | 取り消す API を契約に足し、`cancel` から呼ぶ |
| `src/app/pair/parent.tsx` の `waitingChild` の表示 | Figma にない「子どもの返事を待っています」の見た目 | QR・連携の画面と同じ形（`MessageView`） | `pair/parent.tsx` |
| `src/app/pair/parent.tsx` の親15 のボタン | Figma は「使用状況を見る」（親01 へ） | 「1日の上限を決める」→ 通常上限の画面（Q7） | `pair/parent.tsx` の `linked` の `actions` |
| `src/components/pair/parent-flow.ts` の `CODE_PATTERN` | QR の番号の形（契約は1文字以上としか決めていない） | 英数字と `-` `_` の 8〜128 文字 | `CODE_PATTERN`（サーバの番号の作り方 `store.ts` の `randomCode` とそろえる） |
| `src/components/child/child-view.ts` の `paceView` | ペースの札の判定 | → Q23 | → Q23 |
| `src/components/child/child-view.ts` の `dayCalc` | 子02 の過去の日を、どの対象外アプリの設定で数えるか | 今の設定で数える（端末はその日の設定を残していない）。親の画面はサーバに送った合計を使うので、親子で値がずれることがある | `dayCalc`（端末にその日の対象外の設定を残すなら `child-data.tsx` も） |
| `src/components/child/child-view.ts` の `RECOMMENDED_APP_PACKAGES` | 子11 の「お勧めアプリ」 | Google Classroom・Duolingo を上から順に試す | `RECOMMENDED_APP_PACKAGES`（`LEARNING_PACKAGES` とそろえたい） |
| `src/components/parent/review.ts` の `limitReduction`・`src/app/parent/review.tsx` | 「減った」の基準 | → Q19 | → Q19 |
| `src/components/parent/charts.ts` の `reviewWeekBars` | 親03 の棒の上の数字の意味 | 計画の前の週は使った時間の平均、計画の中の週は上限の平均（Figma どおり） | `reviewWeekBars` |
| `src/components/parent/excluded.ts` の `excludedRows` | 対象外から外したアプリの「反映済み／反映待ち」 | 外した版がサーバの応答にないので、親16 の画面で保存したときの版を覚えて比べる。アプリを開き直すと分からなくなり「反映済み」とみなす | サーバの `ExcludedAppsView` に「一覧が最後に変わった版」を足し、`excludedRows` でそれを使う |
| `src/components/schedule/logic.ts`（重なりの検査） | 重なる期間の扱い | 断る（サーバと同じ） | → Q16-3 |

## 3. 資料どうしの食い違いのうち実装に関わるもの

| # | 食い違い | 今の扱い | 変えるときに直す所 |
|---|---|---|---|
| 1 | 紐づけの段階: FigJam は「親が読んだら即 D2 に保存」の2段階、作り直し前の設計と Figma 子18 は「子どもが『はい』で確定」の3段階 | 3段階（plan.md で作り直し前の設計を使うと決まっている） | `store.ts` の `pairClaim`・`pairConfirm`、`child-flow.ts`・`parent-flow.ts` |
| 2 | C7 の古い応答: FigJam は「古い応答を捨てて『古い可能性あり』と出す」。作る前の質問の一覧のおすすめは「手元を最新のまま使う」 | FigJam どおり出す（上の `config-cache.ts` の項目） | `config-cache.ts`・`child-view.ts` の `staleNotice` |
| 3 | C6 の図では、親の画面でも C2（端末の使用時間）を呼ぶように見える | 親の画面は C2 を呼ばない。サーバに届いた記録だけを使う（MVP_SPEC 5.2「親端末の UsageStats を子どもの実績として使わない」） | — |
| 4 | C4 の判定の書き方が図によって違う | 判定の順は「必須例外 → 対象外アプリ → 上限到達」（`usage-calc.ts` の `isExcluded` → `calcUsage`）。制限画面の名前は Figma 子11「利用時間が終わった画面」 | Kotlin を作るときにそろえる |
| 5 | C8 の部分成功（「成功分だけ送信待ちを解除」）が図では1件分の流れ | サーバは日ごとに採用・不採用を決め、採用した日を `appliedDates` で返す。端末は `accepted`／`duplicate` なら1回分をまとめて消す | `store.ts` の `usageUpload`・`usage-outbox.ts` の `flushOnce` |
| 6 | 親01・子01 の「詳しく見る」の行き先が図にない。作る前の質問の一覧のおすすめは「子01 → 子02、親01 → 親03」 | 子01 → 子02。**親01 → 親09（アプリごとの利用時間）**（おすすめと違う） | `src/app/parent/home.tsx` の `TodayCard` |
| 7 | 子07 設定は下部タブにもあるのに、Figma に戻るボタンがある。作る前の質問の一覧のおすすめは「タブの画面には戻るボタンを出さない（親04 にそろえる）」 | 子07 は Figma どおり戻るボタンを出す（押すとホーム）。親04 は出さない | `src/app/child/settings.tsx` の `onBack` |
| 8 | 親16 に戻るボタンがない（設定から入る画面なのに） | 戻るボタンを出す | `src/app/parent/excluded-apps.tsx` |
| 9 | Figma の日程は日付1つ、子05 は入力欄2つ。仕様は名前・開始日・終了日 | 登録も変更も名前・開始日・終了日の3つ（`PeriodForm`） | `src/components/schedule/PeriodForm.tsx` |
| 10 | MVP_SPEC 5.1 の子07 に「親設定の閲覧専用導線」がある | Q13 で「足さない」と決まったので作っていない | `src/app/child/settings.tsx` |
| 11 | MVP_SPEC 5章の Figma の node id（`148:…`、ファイル「ハッカソン練習向け」）と、画面のコメントの node id（`108:…`、ファイル `UGp5tyARKxFRWzOl6KeKVP`）が違う | 画面は `108:…` の「最新」の画面を見て作った | Figma のファイルを1つに決めたら、画面の先頭のコメントと [screens.md](screens.md) を直す |
| 12 | MVP_SPEC 9章の QR の期限は「例：5分（提案値で未承認）」 | 10分（Q10） | `store.ts` の `PAIR_TTL_MS`・`child-flow.ts` の `PAIR_TTL_MS`（2か所をそろえる） |
| 13 | `backend/` の DB の表が、今の契約（役割なしの人・制限なしの日・空白期間・測った時刻・`createdByRole`・`label`・`sinceVersion` など）を入れられない | サーバはメモリの store を使い、DB にはまだつないでいない | 詳しくは [data.md の 6章](data.md)。`backend/src/db/schema/` |
| 14 | `app.json` の `android.package` が `dev.hackathon.kit`（ひな型のまま）。Google ログインの Android の登録にはパッケージ名が要る | 人間が後で決める（plan.md）。`ESSENTIAL_PACKAGES` にも同じ値を入れてある | `app.json`、`src/lib/usage-calc.ts` の `ESSENTIAL_PACKAGES`、Google Cloud の Android のクライアント（[google-login-setup.md](google-login-setup.md)） |
| 15 | `.env.example` と `src/server/db/schema.ts` のコメントが `docs/rules/stack.md` を指しているが、そのファイルはリポジトリにない | — | コメントを直すか、`docs/rules/stack.md` を作る |
| 16 | `tests/verify/c3-c7-c8.test.ts` の注意（MOCK のサーバを再起動したら子どもの端末の設定のキャッシュを「ログアウト等」で消す）に対し、今のログアウトは設定のキャッシュを消さない（`configCache.clear` はどこからも呼ばれていない） | デモではアプリのデータを消す（[development.md](development.md) の「デモの前の注意」） | ログアウトで消すなら `src/lib/storage.ts` の `clearSessionData` か `session.tsx` の `signOut` から `configCache.clear` を呼ぶ |

## 4. 記録されている不具合

`tests/verify/known-bugs.test.ts` に、確かめ役（V）が見つけた不具合が「正しい期待値のテスト」として書いてあります。**直るまでこのテストは失敗し、`npm run check` が落ちます。** 直してもテストは残し、期待値を実装に合わせて書き換えません。

| # | 重さ | 内容 | 場所 |
|---|---|---|---|
| 1 | 重い | 送信待ちに契約に合わない記録が1件入ると、送信待ちが丸ごと消える（一覧全体を検査し、1件でも合わないと「ない」として読むため） | `src/lib/usage-outbox.ts` の `read` |
| 2 | 中 | 送る記録のアプリ名が 120 文字を超える（アプリが 1000 個を超える）と、契約に合わない記録を作る | `src/lib/usage-calc.ts` の `toUsageDayReport` |
| 3 | 中 | 日時として読めない `measuredAt` をサーバが受け付け、その日の記録が二度と更新されなくなる（契約の `IsoDateTime` が「空でない文字列」だけのため） | `contracts/schemas.ts` の `IsoDateTime`・`store.ts` の `usageUpload` |
| 4 | 軽い | 子どもが QR を出すときに入れた呼び名が、紐づけの後に消える（確定後は Google のアカウント名になる） | `store.ts` の `pairConfirm` |
