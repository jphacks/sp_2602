// OS 固有の処理への入口（lead の担当）。画面・共通の処理は KitNative（Kotlin）を直接 import せず、ここを経由する。
// 形は contracts/native.ts の NativeEngine。将来 iOS に対応するとき、Swift 側に同じ形の関数を作れば、画面を直さずに差し替えられる。
// Kotlin の関数を足したら、modules/kit-native/src/KitNativeModule.ts に型を足す（ここは名前で探すので、Kotlin に無い間は安全な既定値を返す）。
// Kotlin のモジュールが無い（Expo Go・テスト・まだ作っていない関数）ときは、落とさずに「何も起きない・空」を返す。
//   権限は全部 false（未許可）、ルールは null、エンジンは止まっている、使用時間は空。saveRules・startEngine などは何もしない。
//   使えるかどうかは native.available で分かる（画面はこれを見て「この端末では使えません」と出せる）。
import type { EngineStatus, NativeEngine, NativeUsage } from "@contracts/native";
import { requireOptionalNativeModule } from "expo";

// 無いかもしれないので、モジュールも関数も1つずつ確かめてから呼ぶ
const mod = requireOptionalNativeModule<Partial<NativeEngine> & { ping?: () => string }>("KitNative");

function pick<K extends keyof NativeEngine>(name: K): NativeEngine[K] | undefined {
  const fn = mod?.[name];
  return typeof fn === "function" ? (fn.bind(mod) as NativeEngine[K]) : undefined;
}

const today = () => new Date().toISOString().slice(0, 10);
const stopped: EngineStatus = { running: false, rulesUpdatedAt: null };

export const native: NativeEngine & {
  available: boolean;
  // JavaScript から Kotlin を呼べるかの確認用。モジュールが無ければ null
  ping: () => string | null;
} = {
  available: mod != null,
  ping: () => (typeof mod?.ping === "function" ? mod.ping() : null),
  getPermissions: () => pick("getPermissions")?.() ?? { usageAccess: false, accessibility: false, overlay: false },
  openPermissionSettings: (permission) => pick("openPermissionSettings")?.(permission),
  saveRules: (rules) => pick("saveRules")?.(rules),
  loadRules: () => pick("loadRules")?.() ?? null,
  startEngine: () => pick("startEngine")?.(),
  stopEngine: () => pick("stopEngine")?.(),
  getEngineStatus: () => pick("getEngineStatus")?.() ?? stopped,
  getUsage: (date) => pick("getUsage")?.(date) ?? ({ date: date ?? today(), apps: [] } satisfies NativeUsage),
};
