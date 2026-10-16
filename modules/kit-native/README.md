# kit-native（Android 固有の処理）

Kotlin で書く Android 専用の部品。Expo のモジュールとして `modules/` に置く（`/android/` は `npx expo prebuild` が作り直す生成物で Git に入らないため、自作の Kotlin はここ）。

| 場所 | 中身 |
|---|---|
| `android/src/main/java/dev/hackathon/kit/kitnative/KitNativeModule.kt` | TS から呼ばれる窓口（Function の定義だけ。判定などの中身は書かない） |
| `android/src/main/java/dev/hackathon/kit/kitnative/engine/` | 監視・制限エンジン（使用中アプリの検出・使用時間の計測・制限画面・ルールの保存）。React Native の画面が動いていなくても動く独立した部品 |
| `src/KitNativeModule.ts` | Kotlin の関数の TS 側の型 |
| `../../contracts/native.ts` | 窓口の型（`NativeEngine`。TS 側から見た契約） |

- 画面・共通処理は `src/lib/native.ts` だけを経由する。
- 窓口に関数を足すときは `contracts/native.ts` → Kotlin の Function → `src/KitNativeModule.ts` の順にそろえる。
- Gradle のビルドは実機・Android Studio で確かめる（E3）。
