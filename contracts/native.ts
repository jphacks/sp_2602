// Native Module（Kotlin）の窓口の型。画面・共通処理は Android の機能を直接呼ばず、この型だけを知る（src/lib/native.ts が実装を束ねる）。
// ここは「型だけ」。Zod は使わない（端末の中だけで使い、サーバとは受け渡さない）。Kotlin の中身はまだない（modules/kit-native/）。
// 将来 iOS に対応するときは、Swift 側に同じ形を作れば画面を直さずに差し替えられる。
//   C2: 使用状況アクセスの権限・日別アプリ別の使用時間
//   （端末のアプリ一覧を取る窓口は置かない。TODO(保留): Q15 親が選ぶ候補をどこから得るかは保留）
//   C4: 上限に達したときの制限画面（OS が許す範囲で出す。強制停止・常時遮断は保証しない。MVP_SPEC 2章）

// 必要な権限。usageAccess = 使用状況へのアクセス（UsageStatsManager。C2）、
// overlay = 他のアプリの上に重ねて表示（制限画面。C4）、accessibility = 前面アプリの検出（C4）
export type NativePermission = "usageAccess" | "overlay" | "accessibility";

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

// C4 の判定に使う値。C7 で取り込んだ設定と C3 の結果から作って Kotlin に渡す（Kotlin は RN の画面が動いていなくても判定する）
export type NativeRestriction = {
  date: string; // YYYY-MM-DD（この値が効く日）
  // その日の上限。unset（親がまだ決めていない）と unlimited（空白期間）は、どちらも制限しないが意味が違うので分けて渡す
  limit: { kind: "limited"; limitMinutes: number } | { kind: "unlimited" } | { kind: "unset" };
  excludedPackages: string[]; // 制限対象外アプリ（C9）
  essentialPackages: string[]; // 安全上の必須例外（電話など。C9 とは別管理）
  learningPackages: string[]; // 上限に達したとき誘導する学習用アプリ（C4）
  configVersion: number; // どの版の設定から作ったか
};

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

  // ── C4 ──
  // 判定に使う値を端末に保存する。以後はオフラインでもこれで判定する
  saveRestriction(restriction: NativeRestriction): void;
  // 監視・制限を始める / 止める
  startEngine(): void;
  stopEngine(): void;
  getEngineStatus(): EngineStatus;
  // 制限画面（子11 に相当する案内）を前面に出す。OS が許さないときは false
  showLimitReached(): boolean;
  // アプリを開く（学習用アプリへの誘導）。開けなければ false
  openApp(packageName: string): boolean;
}
