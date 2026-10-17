# 契約の変更履歴

contracts/ を変えたら、同じ PR で必ず1行足す（CI と pre-commit が検査する）。
形式: `- HH:MM [追加|破壊] 何を変えたか — 影響する人 — Issue #番号`
「破壊」（既存のフィールド削除・型変更・名前変更）は同期点でしか入れない。

- 00:00 [追加] ひな型の初期契約（Item / AnalyzeRequest / AnalyzeResult / AnalyzeChunk / ApiError / api.health / api.analyze / api.analyzeStream） — 全員 — なし
- 00:00 [追加] StreamDef（ストリームの API 1本の形。stream()/handleStream() が使う。ストリームの API が0本でも型が崩れない） — back・lead — なし
- 00:00 [追加] screens.md の所有者を5人構成に（home = front-a / result = front-b。型は変更なし） — front-a・front-b — なし
- 00:00 [追加] screens.md の担当の列を4人構成に（画面の本体 = front-b・見た目の部品 = front-a。型は変更なし） — front-a・front-b — なし
- 00:00 [追加] screens.md の表の「所有者」列の名前を「担当」に変えた（編集を制限する仕組みの削除に合わせた表記。型・中身は変更なし） — 全員 — なし
- 23:25 [破壊] Android アプリ向けに契約を作り替えた: ひな型の例を Item / Analyze* から Role / AppLimit / Rules / RulesQuery / RulesSave / SyncChunk に、API を analyze・analyzeStream から rulesGet・rulesSave・rulesSyncStream に、画面の場所を src/app/<id>/page.tsx から src/app/<id>/index.tsx（Expo Router）に変えた。見た目の契約は tokens.css から tokens.ts に — 全員 — kit:reset で例は消える。API の処理は src/server/handlers/<API名>.ts
- 10:00 [追加] 親子と使用状況の型を足した: Child / AppUsage / Usage / UsageReport、API は usageReport（子ども端末が送る）・usageGet（保護者が見る）。Role（保護者・子ども）は置き場のみで、認証・ペアリングは未決のため型にしていない。fixtures と契約テスト（fixtures が型に合うか）も追加 — back・front・Kotlin 担当 — なし
- 23:33 [追加] Native Module の窓口の型を足した（contracts/native.ts: NativeEngine と NativePermission / NativeRules / NativeUsage / EngineStatus。型のみで Zod・API は無し） — front・Kotlin 担当・lead — なし
- 23:37 [破壊] screens.md の画面を home・result から role・parent-rules・parent-usage・child-home に作り替えた（保護者・子どもの画面。受け渡しは Rules のみで型は変更なし。画面ファイルは src/app/<id>/index.tsx） — 全員 — 旧 home・result を使う宣言は書き直す
- 13:49 [破壊] 層1（ログインと合言葉）: 型 GoogleSignIn / Session、API authGoogle（POST /api/auth/google）・authMe（GET /api/auth/me）、エラー unauthorized(401) / forbidden(403) を足した。API の表の全行に auth（none / signedIn / parent / child）を足し、サーバの入口が毎回確かめる（rulesSave・usageGet は保護者だけ、usageReport は子どもだけ、rulesGet・rulesSyncStream はログイン済み）。合言葉なしの呼び出しは 401 になる。子どもは自分の childId の分だけ（ほかの子どもの id は 403） — 全員 — Issue #21。画面はログイン後に setSessionToken(session.token) を呼ぶ。MOCK=1 の合言葉は contracts/fixtures.ts の mockSessions（npm run api -- … --token mock-token-parent）
