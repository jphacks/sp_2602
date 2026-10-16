import { NativeModule, requireNativeModule } from "expo";

// Kotlin 側（android/src/main/java/.../KitNativeModule.kt）で定義した関数の型。Kotlin に足したらここにも足す。
declare class KitNativeModule extends NativeModule {
  ping(): string;
}

export default requireNativeModule<KitNativeModule>("KitNative");
