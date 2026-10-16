// Native Module（Kotlin）の窓口の型。画面・共通処理は Android の機能を直接呼ばず、この型だけを知る（src/lib/native.ts が実装を束ねる）。
// 将来 iOS に対応するときは、Swift 側に同じ形を作れば画面を直さずに差し替えられる。
// ここは「型だけ」。Zod は使わない（端末の中だけで使い、サーバとは受け渡さない）。ルール・使用状況の形は schemas.ts のものをそのまま使う。
import type { AppLimit, AppUsage } from "./schemas";

// 制限の判定に必要な権限。Android では設定画面で保護者が許可する（OS から取り消されるのは防げない）
export type NativePermission = "usageAccess" | "accessibility" | "overlay";

export type NativePermissionStatus = Record<NativePermission, boolean>;

// 監視・制限エンジンの状態。エンジンは React Native の画面が動いていなくても動く独立した部品
export type EngineStatus = {
  running: boolean;
  rulesUpdatedAt: string | null; // 端末に保存してある最後のルールの更新時刻（ISO 8601）。なければ null
};

// 端末に保存するルール。判定は端末内だけで完結し、サーバの返事を待たない
export type NativeRules = {
  childId: string;
  limits: AppLimit[];
  updatedAt: string; // ISO 8601
};

// 端末が測ったある日の使用時間（schemas.ts の Usage に直してからサーバへ送る）
export type NativeUsage = {
  date: string; // YYYY-MM-DD（端末のある日）
  apps: AppUsage[];
};

// TS から呼べる Kotlin 側の機能の一覧（Kotlin の Function 名と1対1）
export interface NativeEngine {
  // 必要な権限が許可されているか
  getPermissions(): NativePermissionStatus;
  // 権限の設定画面を開く（許可はユーザーが設定画面で行う）
  openPermissionSettings(permission: NativePermission): void;
  // 最後に同期したルールを端末に保存する。以後はオフラインでもこれで判定する
  saveRules(rules: NativeRules): void;
  // 保存してあるルール。なければ null
  loadRules(): NativeRules | null;
  // 監視・制限を始める / 止める
  startEngine(): void;
  stopEngine(): void;
  getEngineStatus(): EngineStatus;
  // 指定した日の使用時間（date を省くと今日）
  getUsage(date?: string): NativeUsage;
}
