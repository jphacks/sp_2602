// OS 固有の処理（C2・C4）への入口。画面・共通の処理は KitNative（Kotlin）を直接 import せず、ここを経由する。
// 形は contracts/native.ts の NativeEngine。Kotlin の中身は modules/kit-native/android/src/main/java/dev/hackathon/kit/kitnative/
// （KitNativeModule.kt と engine/）。Kotlin に関数を足したら modules/kit-native/src/KitNativeModule.ts に型を足す
// （ここは名前で探すので、Kotlin に無い間は安全な既定値を返す）。
// Kotlin のモジュールや関数が無いとき（Expo Go・テスト・作り直す前のアプリ）・Kotlin が例外を出したときは落とさずに:
//   権限は全部 false、使用時間は unavailable（0 分にしない）、制限画面は出せない（false）、エンジンは止まっている。
// 開発用: EXPO_PUBLIC_FAKE_USAGE=1（.env）か setFakeUsage(true) で、Kotlin がなくても仮の使用時間を返す
//   （C3・画面の確認用。仮の値であることは native.fake で分かる）。
import { demoAppMinutes } from "@contracts/fixtures";
import type { EngineStatus, NativeEngine, NativeUsageResult } from "@contracts/native";
import { requireOptionalNativeModule } from "expo";

// 無いかもしれないので、モジュールも関数も1つずつ確かめてから呼ぶ
const mod = requireOptionalNativeModule<Partial<NativeEngine> & { ping?: () => string }>("KitNative");

function pick<K extends keyof NativeEngine>(name: K): NativeEngine[K] | undefined {
  const fn = mod?.[name];
  return typeof fn === "function" ? (fn.bind(mod) as NativeEngine[K]) : undefined;
}

let fake = process.env.EXPO_PUBLIC_FAKE_USAGE === "1";

// 開発用の仮の値を使うかを切り替える（Kotlin の関数があるときは、そちらが優先）
export function setFakeUsage(enabled: boolean): void {
  fake = enabled;
}

const stopped: EngineStatus = { running: false, restrictionDate: null };

// 同期の関数を呼ぶ。関数が無い・Kotlin が例外を出した（Activity がない など）ときは既定値を返す
// （なぜ: 画面の更新の途中（child-data.tsx の refresh）で例外が出ると、C8 の送信など後ろの処理まで止まるため）
function callSafe<K extends keyof NativeEngine>(
  name: K,
  fallback: ReturnType<NativeEngine[K]>,
  ...args: Parameters<NativeEngine[K]>
): ReturnType<NativeEngine[K]> {
  const fn = pick(name) as ((...a: Parameters<NativeEngine[K]>) => ReturnType<NativeEngine[K]>) | undefined;
  if (!fn) return fallback;
  try {
    return fn(...args) ?? fallback;
  } catch {
    return fallback;
  }
}

// 仮の使用時間: 見本の記録（contracts/fixtures.ts）を、時刻に合わせて少しずつ増えるようにした値
function fakeUsage(date: string): NativeUsageResult {
  const hour = new Date().getHours();
  const scale = Math.min(1, (hour + 1) / 20);
  return {
    status: "ok",
    date,
    measuredAt: new Date().toISOString(),
    apps: demoAppMinutes.map((r) => ({
      packageName: r.packageName,
      label: r.label,
      usedMinutes: Math.round(r.usedMinutes * scale),
    })),
  };
}

export const native: NativeEngine & {
  available: boolean; // Kotlin のモジュールがあるか（画面はこれを見て「この端末では使えません」と出せる）
  readonly fake: boolean; // 仮の値を返しているか
  ping: () => string | null; // JavaScript から Kotlin を呼べるかの確認用。モジュールが無ければ null
} = {
  available: mod != null,
  get fake() {
    return fake && !pick("getDailyUsage");
  },
  ping: () => (typeof mod?.ping === "function" ? mod.ping() : null),

  // ── C2 ──
  getPermissions: () =>
    callSafe("getPermissions", {
      usageAccess: fake,
      overlay: false,
      notifications: false,
      batteryOptimization: false,
    }),
  openPermissionSettings: (permission) => callSafe("openPermissionSettings", undefined, permission),
  getDailyUsage: async (date) => {
    const fn = pick("getDailyUsage");
    if (fn) {
      try {
        return await fn(date);
      } catch (e) {
        return { status: "unavailable", reason: e instanceof Error ? e.message : "使用時間を取得できませんでした" };
      }
    }
    if (fake) return fakeUsage(date);
    return { status: "unavailable", reason: "この端末では使用時間を取得できません（Kotlin の部品がまだありません）" };
  },

  // ── C4 ──
  saveRestriction: (restriction) => callSafe("saveRestriction", undefined, restriction),
  startEngine: () => callSafe("startEngine", undefined),
  stopEngine: () => callSafe("stopEngine", undefined),
  getEngineStatus: () => callSafe("getEngineStatus", stopped),
  showLimitReached: () => callSafe("showLimitReached", false),
  openApp: (packageName) => callSafe("openApp", false, packageName),
  clearLocalData: () => callSafe("clearLocalData", undefined),
};
