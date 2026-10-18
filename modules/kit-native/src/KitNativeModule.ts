import type {
  EngineStatus,
  NativeLauncherAppsResult,
  NativeParentWidget,
  NativePermission,
  NativePermissionStatus,
  NativeRestriction,
  NativeUsageResult,
} from "@contracts/native";
import { NativeModule, requireNativeModule } from "expo";

// Kotlin 側（android/src/main/java/.../KitNativeModule.kt）で定義した関数の型。Kotlin に足したらここにも足す。
// 画面からは使わず src/lib/native.ts を経由する（そちらは Kotlin が無いときの既定値を持つ）。
// 形は contracts/native.ts の NativeEngine と同じ（Kotlin は成否を boolean で返すものがあるが、窓口では使っていない）
declare class KitNativeModule extends NativeModule {
  ping(): string;
  // ── C2 ──
  getPermissions(): NativePermissionStatus;
  openPermissionSettings(permission: NativePermission): boolean;
  getDailyUsage(date: string): Promise<NativeUsageResult>;
  // ── Q15 ──
  getLauncherApps(): Promise<NativeLauncherAppsResult>;
  // ── C4 ──
  saveRestriction(restriction: NativeRestriction): boolean;
  startEngine(): boolean;
  stopEngine(): void;
  getEngineStatus(): EngineStatus;
  showLimitReached(): boolean;
  openApp(packageName: string): boolean;
  clearLocalData(): void;
  // ── D-113（許可の見張りと親への通告）──
  setStatusReporter(url: string, token: string, childId: string): void;
  clearStatusReporter(): void;
  // ── C5（保護者のウィジェット）──
  saveParentWidget(data: NativeParentWidget): boolean;
}

export default requireNativeModule<KitNativeModule>("KitNative");
