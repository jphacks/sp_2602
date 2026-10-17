// Native Module（Kotlin）の窓口の型。画面・共通処理は Android の機能を直接呼ばず、この型だけを知る（src/lib/native.ts が実装を束ねる）。
// ここは「型だけ」。Zod は使わない（端末の中だけで使い、サーバとは受け渡さない）。
// Kotlin の中身: modules/kit-native/android/src/main/java/dev/hackathon/kit/kitnative/（KitNativeModule.kt と engine/）。
// 将来 iOS に対応するときは、Swift 側に同じ形を作れば画面を直さずに差し替えられる。
//   C2: 使用状況アクセスの権限・日別アプリ別の使用時間
//   Q15: ホーム画面に出るアプリの一覧とアイコン（親16 で対象外を選ぶ候補・保護者の画面のアイコンとして、サーバへ送る。D-110）
//   C4: 上限に達したときの制限画面（OS が許す範囲で出す。強制停止・常時遮断は保証しない。MVP_SPEC 2章）

// 必要な権限（どれも Android の設定画面でユーザーが許可する。許可の順番もこの順）
//   usageAccess         = 使用状況へのアクセス（UsageStatsManager。C2 の使用時間と、C4 の前面アプリの検出）
//   overlay             = 他のアプリの上に表示（SYSTEM_ALERT_WINDOW。C4 で裏から「時間は終わりです」の画面を前に出す）
//   notifications       = 通知（POST_NOTIFICATIONS。見守り中の通知と、overlay がないときの案内の通知。C4）
//   batteryOptimization = 電池の最適化から外す（OS が監視を止めにくくする。C4）
// 前面アプリの検出にユーザー補助（accessibility）は使わない（使用状況のイベントで足りる。ユーザー補助はストアの審査が厳しい）
export type NativePermission = "usageAccess" | "overlay" | "notifications" | "batteryOptimization";

export type NativePermissionStatus = Record<NativePermission, boolean>;

// 1アプリぶんの、ある1日の使用時間（端末が測った生の値。対象外かどうかは C3 が決める）
export type NativeAppUsage = {
  packageName: string;
  label: string; // 画面に出すアプリ名
  usedMinutes: number; // その日のそれまでの合計（分）
};

// 日別・アプリ別の使用時間の取得結果（C2）。取れなかったときを 0 分にしない（MVP_SPEC 4.2）
//   ok                : 取れた（apps が空 = 本当に何も使っていない）
//   permission_denied : 使用状況へのアクセスが許可されていない → 権限の案内を出す
//   unavailable       : それ以外の理由で取れない（モジュールがない・OS のエラー）→「取得不可」と出す
export type NativeUsageResult =
  | { status: "ok"; date: string; apps: NativeAppUsage[]; measuredAt: string }
  | { status: "permission_denied" }
  | { status: "unavailable"; reason: string };

// ある日の上限。unset（親がまだ決めていない）と unlimited（空白期間）は、どちらも制限しないが意味が違うので分けて渡す
export type NativeDayLimit = { kind: "limited"; limitMinutes: number } | { kind: "unlimited" } | { kind: "unset" };

// ウィジェットに渡すテスト期間（contracts/schemas.ts の TestPeriod のうち、表示に要るものだけ）
export type NativeTestPeriod = { name: string; startDate: string; endDate: string };

// C4 の判定に使う値。C7 で取り込んだ設定と C3 の結果から作って Kotlin に渡す（Kotlin は RN の画面が動いていなくても判定する）。
// Kotlin は端末に保存し（SharedPreferences "slope_engine" の "restriction"）、監視の Service とウィジェットが読む
export type NativeRestriction = {
  date: string; // YYYY-MM-DD（この値が効く日）
  limit: NativeDayLimit; // その日の上限
  // date の翌日から先の日別上限（電波がなく Slope を開かない日が続いても、Kotlin が次の日も判定できるように）。
  // 一覧にない日は「ルールが分からない」として判定しない
  upcoming?: { date: string; limit: NativeDayLimit }[];
  // C7 のテスト期間（判定には使わない。ウィジェット C5 の「次のテスト」に出すため、Kotlin がウィジェットの保存へ渡す）
  testPeriods: NativeTestPeriod[];
  excludedPackages: string[]; // 制限対象外アプリ（C9）
  essentialPackages: string[]; // 安全上の必須例外（電話など。C9 とは別管理）
  learningPackages: string[]; // 上限に達したとき誘導する学習用アプリ（C4）
  configVersion: number; // どの版の設定から作ったか
};

// 保護者のウィジェット（Figma 親08）の左「初日から」に出す、ある日の上限の減り。
// ok: 「40 分 減」「上限 300→260分」（reducedMinutes が負なら増えた）。数字を出せない日は message の文を出す（0 と出さない）
export type NativeParentReduction =
  | { kind: "ok"; reducedMinutes: number; fromLimit: number; toLimit: number }
  | { kind: "message"; title: string; body: string };

// 保護者のウィジェットの値。保護者のアプリが振り返り（src/components/parent/review.ts の limitReduction）と C7 の設定から作り、
// Kotlin が端末に保存する（"slope.widget"）。日ごとの値を先の日の分まで渡すのは、保護者が Slope を開かない日が続いても、
// ウィジェットがその日の値を出せるようにするため（一覧にない日は「Slope を開くと出ます」）
export type NativeParentWidget = {
  days: { date: string; reduction: NativeParentReduction }[]; // 今日から先の日ごとの減り
  testPeriods: NativeTestPeriod[]; // 右「テストまで」（子どものウィジェットと同じ決め方で次のテストを選ぶ）
};

// ホーム画面に出るアプリ1つ（Q15。ACTION_MAIN + CATEGORY_LAUNCHER のあるアプリ。Slope 自身は入らない）。
// 送るのは識別子・表示名・アイコンだけ（使用時間・入れた日は入れない。D-110）
export type NativeLauncherApp = {
  packageName: string;
  label: string; // 画面に出すアプリ名（引けなければ packageName）
  // アイコン（一辺 96px ほどの PNG・base64・改行なし。20KB 以下に収まるまで小さくする）と、その PNG の SHA-256（16進・小文字）。
  // 作れなかった・収まらなかったアプリは null（保護者の画面は仮のアイコンのまま）。古い版の Kotlin では無い
  iconPng?: string | null;
  iconHash?: string | null;
};

// アプリ一覧の取得結果。取れなかったときを「アプリが0個」にしない（空の一覧を送ると、親16 の候補が全部消えるため）
//   ok          : 取れた（packageName の順。同じアプリは1つだけ）
//   unavailable : 取れない（モジュールがない・OS のエラー）→ 送らない
export type NativeLauncherAppsResult =
  | { status: "ok"; apps: NativeLauncherApp[] }
  | { status: "unavailable"; reason: string };

// 監視・制限エンジンの状態
export type EngineStatus = {
  running: boolean;
  restrictionDate: string | null; // 端末に保存してある NativeRestriction の日付。なければ null
};

// TS から呼べる Kotlin 側の機能の一覧（Kotlin の Function 名と1対1）
export interface NativeEngine {
  // ── C2 ──
  // 必要な権限が許可されているか
  getPermissions(): NativePermissionStatus;
  // 権限の設定画面を開く（許可はユーザーが設定画面で行う）
  openPermissionSettings(permission: NativePermission): void;
  // 指定した日の、アプリ別の使用時間
  getDailyUsage(date: string): Promise<NativeUsageResult>;

  // ── Q15 ──
  // ホーム画面に出るアプリの一覧（QUERY_ALL_PACKAGES は使わず、<queries> の宣言で見える範囲だけ）
  getLauncherApps(): Promise<NativeLauncherAppsResult>;

  // ── C4 ──
  // 判定に使う値を端末に保存する。以後はオフラインでもこれで判定する
  saveRestriction(restriction: NativeRestriction): void;
  // 監視・制限を始める / 止める
  startEngine(): void;
  stopEngine(): void;
  getEngineStatus(): EngineStatus;
  // 制限画面（子11 に相当する案内）を前面に出す。OS が許さないとき（重ねて表示・通知のどちらも許可がない）は false
  showLimitReached(): boolean;
  // アプリを開く（学習用アプリへの誘導）。開けなければ false
  openApp(packageName: string): boolean;
  // ログアウトのときに、端末に残した値を全部消す（監視を止め、判定の値・今日の使用量・ウィジェットの値を消して描き直す）
  clearLocalData(): void;

  // ── C5（保護者のウィジェット・親08）──
  // 保護者のウィジェットの値を端末に保存し、ウィジェットを保護者の形で描き直す。
  // ウィジェットは1つ（SlopeWidget）で、最後に保存した役割（saveRestriction = 子ども・saveParentWidget = 保護者）の形で描く
  saveParentWidget(data: NativeParentWidget): void;
}
