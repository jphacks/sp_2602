// Android 固有の処理（Kotlin）の入口。画面や共通の処理は直接 import せず、src/lib/native.ts を経由する。

export * from "./src/KitNative.types";
export { default } from "./src/KitNativeModule";
